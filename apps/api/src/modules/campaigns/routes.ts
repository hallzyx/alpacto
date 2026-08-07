import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import {
  campaigns,
  organizations,
  pricingCategories,
  pricingPolicies,
  users,
  type Database,
} from "@alpacto/database";
import { createCampaignSchema } from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { resolveAssociationOrgIds } from "../../lib/ayni-role-scope.js";

function parseCalendarDate(value: string | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value}T00:00:00.000Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid date");
  return d;
}

function serializeCampaignBase(row: typeof campaigns.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    buyerId: row.buyerId,
    name: row.name,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    status: row.status,
    pricingPolicyId: row.pricingPolicyId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadPricingBundle(db: Database, pricingPolicyId: string) {
  const [policy] = await db
    .select()
    .from(pricingPolicies)
    .where(eq(pricingPolicies.id, pricingPolicyId))
    .limit(1);
  if (!policy) return null;
  const categories = await db
    .select()
    .from(pricingCategories)
    .where(eq(pricingCategories.pricingPolicyId, pricingPolicyId));
  return {
    id: policy.id,
    version: policy.version,
    currency: policy.currency,
    associationFeeBps: policy.associationFeeBps,
    platformFeeBps: policy.platformFeeBps,
    weightToleranceBps: policy.weightToleranceBps,
    penPerUsdcMicros: policy.penPerUsdcMicros.toString(),
    policyHash: policy.policyHash,
    createdBy: policy.createdBy,
    lockedAt: policy.lockedAt?.toISOString() ?? null,
    createdAt: policy.createdAt.toISOString(),
    categories: categories.map(c => ({
      code: c.code,
      label: c.label,
      pricePenMinorPerKg: c.pricePenMinorPerKg.toString(),
      qualityBonusPenMinorPerKg: c.qualityBonusPenMinorPerKg.toString(),
    })),
  };
}

async function enrichCampaign(db: Database, row: typeof campaigns.$inferSelect) {
  const [[org], [buyer], pricing] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, row.organizationId)).limit(1),
    db.select().from(users).where(eq(users.id, row.buyerId)).limit(1),
    loadPricingBundle(db, row.pricingPolicyId),
  ]);
  return {
    ...serializeCampaignBase(row),
    associationName: org?.name ?? null,
    associationType: org?.type ?? null,
    buyerName: buyer?.name ?? null,
    buyerEmail: buyer?.email ?? null,
    pricing,
  };
}

async function assertCanViewCampaign(db: Database, user: AuthUser, row: typeof campaigns.$inferSelect) {
  if (user.role === "admin" || user.role === "inspector") return;
  if (user.role === "buyer") {
    if (row.buyerId !== user.id) throw new ApiError(403, "Forbidden");
    return;
  }
  if (user.role === "association") {
    const orgIds = await resolveAssociationOrgIds(db, user.id, false);
    if (!orgIds.includes(row.organizationId)) throw new ApiError(403, "Forbidden");
    return;
  }
  // producers and others: deny direct campaign fetch unless needed later
  throw new ApiError(403, "Forbidden");
}

async function listVisibleCampaigns(db: Database, user: AuthUser) {
  if (user.role === "buyer") {
    return db.select().from(campaigns).where(eq(campaigns.buyerId, user.id));
  }
  if (user.role === "association") {
    const orgIds = await resolveAssociationOrgIds(db, user.id, false);
    if (orgIds.length === 0) return [];
    return db.select().from(campaigns).where(inArray(campaigns.organizationId, orgIds));
  }
  // admin, inspector, and other privileged roles see all
  if (user.role === "admin" || user.role === "inspector") {
    return db.select().from(campaigns);
  }
  return [];
}

export async function registerCampaignRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/campaigns", { preHandler: authenticate }, async request => {
    const user = request.user as AuthUser;
    const rows = await listVisibleCampaigns(db, user);
    if (!rows.length) return { campaigns: [] };

    const orgIds = [...new Set(rows.map(r => r.organizationId))];
    const buyerIds = [...new Set(rows.map(r => r.buyerId))];
    const policyIds = [...new Set(rows.map(r => r.pricingPolicyId))];

    const [orgRows, buyerRows, policyRows, categoryRows] = await Promise.all([
      db.select().from(organizations).where(inArray(organizations.id, orgIds)),
      db.select().from(users).where(inArray(users.id, buyerIds)),
      db.select().from(pricingPolicies).where(inArray(pricingPolicies.id, policyIds)),
      db.select().from(pricingCategories).where(inArray(pricingCategories.pricingPolicyId, policyIds)),
    ]);

    const orgById = new Map(orgRows.map(o => [o.id, o]));
    const buyerById = new Map(buyerRows.map(b => [b.id, b]));
    const policyById = new Map(policyRows.map(p => [p.id, p]));
    const catsByPolicy = new Map<string, typeof categoryRows>();
    for (const cat of categoryRows) {
      const list = catsByPolicy.get(cat.pricingPolicyId) ?? [];
      list.push(cat);
      catsByPolicy.set(cat.pricingPolicyId, list);
    }

    return {
      campaigns: rows.map(row => {
        const org = orgById.get(row.organizationId);
        const buyer = buyerById.get(row.buyerId);
        const policy = policyById.get(row.pricingPolicyId);
        const categories = catsByPolicy.get(row.pricingPolicyId) ?? [];
        return {
          ...serializeCampaignBase(row),
          associationName: org?.name ?? null,
          associationType: org?.type ?? null,
          buyerName: buyer?.name ?? null,
          buyerEmail: buyer?.email ?? null,
          pricing: policy
            ? {
                id: policy.id,
                version: policy.version,
                currency: policy.currency,
                associationFeeBps: policy.associationFeeBps,
                platformFeeBps: policy.platformFeeBps,
                weightToleranceBps: policy.weightToleranceBps,
                penPerUsdcMicros: policy.penPerUsdcMicros.toString(),
                policyHash: policy.policyHash,
                categories: categories.map(c => ({
                  code: c.code,
                  label: c.label,
                  pricePenMinorPerKg: c.pricePenMinorPerKg.toString(),
                  qualityBonusPenMinorPerKg: c.qualityBonusPenMinorPerKg.toString(),
                })),
              }
            : null,
        };
      }),
    };
  });

  app.get("/campaigns/:id", { preHandler: authenticate }, async request => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Campaign not found");
    await assertCanViewCampaign(db, user, row);
    return enrichCampaign(db, row);
  });

  app.post("/campaigns", { preHandler: authenticate }, async request => {
    const user = request.user as AuthUser;
    // Only buyers (and admin) create campaigns. Associations list only.
    if (!["buyer", "admin"].includes(user.role)) {
      throw new ApiError(403, "Only buyers can create campaigns");
    }
    const body = createCampaignSchema.parse(request.body);

    let buyerId = body.buyerId;
    if (!buyerId) {
      if (user.role === "buyer") buyerId = user.id;
      else throw new ApiError(400, "buyerId is required");
    }
    if (user.role === "buyer" && buyerId !== user.id) {
      throw new ApiError(403, "Buyers may only create campaigns for themselves");
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);
    if (!org) throw new ApiError(404, "Organization not found");
    if (org.type !== "association") {
      throw new ApiError(400, "organizationId must be an association");
    }
    const [buyer] = await db.select().from(users).where(eq(users.id, buyerId)).limit(1);
    if (!buyer) throw new ApiError(404, "Buyer not found");
    const [policy] = await db
      .select()
      .from(pricingPolicies)
      .where(eq(pricingPolicies.id, body.pricingPolicyId))
      .limit(1);
    if (!policy) throw new ApiError(404, "Pricing policy not found");

    const [row] = await db
      .insert(campaigns)
      .values({
        organizationId: body.organizationId,
        buyerId,
        name: body.name,
        pricingPolicyId: body.pricingPolicyId,
        startDate: parseCalendarDate(body.startDate),
        endDate: parseCalendarDate(body.endDate),
        status: "active",
      })
      .returning();
    if (!row) throw new ApiError(500, "Failed to create campaign");
    return enrichCampaign(db, row);
  });
}
