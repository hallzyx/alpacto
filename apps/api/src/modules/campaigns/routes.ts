import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  campaigns,
  organizations,
  pricingPolicies,
  users,
  type Database,
} from "@alpacto/database";
import { createCampaignSchema } from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";

function serializeCampaign(row: typeof campaigns.$inferSelect) {
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

export async function registerCampaignRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/campaigns", { preHandler: authenticate }, async () => {
    const rows = await db.select().from(campaigns);
    return { campaigns: rows.map(serializeCampaign) };
  });

  app.get("/campaigns/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Campaign not found");
    return serializeCampaign(row);
  });

  app.post("/campaigns", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["buyer", "association", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const body = createCampaignSchema.parse(request.body);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, body.organizationId))
      .limit(1);
    if (!org) throw new ApiError(404, "Organization not found");
    const [buyer] = await db.select().from(users).where(eq(users.id, body.buyerId)).limit(1);
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
        buyerId: body.buyerId,
        name: body.name,
        pricingPolicyId: body.pricingPolicyId,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: "active",
      })
      .returning();
    if (!row) throw new ApiError(500, "Failed to create campaign");
    return serializeCampaign(row);
  });
}
