import { eq } from "drizzle-orm";
import type { Database } from "../index.js";
import {
  organizationMembers,
  organizations,
  pricingCategories,
  pricingPolicies,
  users,
} from "../schema/index.js";

export const DEMO_POLICY_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

/** Demo v1 — three alpaca fiber grades; settlement uses the inspector's category row. */
export const DEMO_POLICY_CATEGORIES = [
  { code: "FINE", label: "Fino", pricePenMinorPerKg: 2750n, qualityBonusPenMinorPerKg: 0n },
  { code: "MEDIUM", label: "Medio", pricePenMinorPerKg: 2300n, qualityBonusPenMinorPerKg: 0n },
  { code: "COARSE", label: "Grueso", pricePenMinorPerKg: 1850n, qualityBonusPenMinorPerKg: 0n },
] as const;

export const SEED_USERS = [
  {
    email: "martina@demo.alpacto",
    role: "producer",
    name: "Martina Quispe",
    phone: "+51999000001",
  },
  {
    email: "carlos@demo.alpacto",
    role: "inspector",
    name: "Carlos Huamán",
    phone: "+51999000002",
  },
  {
    email: "alpasur@demo.alpacto",
    role: "association",
    name: "Asociación AlpaSur",
    phone: "+51999000003",
  },
  {
    email: "andes@demo.alpacto",
    role: "buyer",
    name: "Andes Textile Import LLC",
    phone: "+12025550001",
  },
  {
    email: "admin@demo.alpacto",
    role: "admin",
    name: "Alpacto Demo Admin",
    phone: "+51999000099",
  },
] as const;

export type SeedUser = (typeof SEED_USERS)[number];

export type FoundationContext = {
  byEmail: Record<string, typeof users.$inferSelect>;
  associationOrg: typeof organizations.$inferSelect;
  buyerOrg: typeof organizations.$inferSelect;
  policy: typeof pricingPolicies.$inferSelect;
};

async function findUserByEmail(db: Database, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

async function upsertUser(db: Database, user: SeedUser) {
  const existing = await findUserByEmail(db, user.email);
  if (existing) return existing;
  const [row] = await db
    .insert(users)
    .values({
      email: user.email,
      role: user.role,
      name: user.name,
      phone: user.phone,
      status: "active",
    })
    .returning();
  if (!row) throw new Error(`Failed to seed user ${user.email}`);
  return row;
}

async function ensureDemoPolicyCategories(db: Database, policyId: string) {
  for (const cat of DEMO_POLICY_CATEGORIES) {
    await db
      .insert(pricingCategories)
      .values({
        pricingPolicyId: policyId,
        code: cat.code,
        label: cat.label,
        pricePenMinorPerKg: cat.pricePenMinorPerKg,
        qualityBonusPenMinorPerKg: cat.qualityBonusPenMinorPerKg,
      })
      .onConflictDoUpdate({
        target: [pricingCategories.pricingPolicyId, pricingCategories.code],
        set: {
          label: cat.label,
          pricePenMinorPerKg: cat.pricePenMinorPerKg,
          qualityBonusPenMinorPerKg: cat.qualityBonusPenMinorPerKg,
        },
      });
  }
}

/**
 * Idempotent upsert of seed accounts, orgs, memberships, and demo pricing.
 * Does not create campaigns/orders/lots.
 */
export async function seedFoundation(db: Database): Promise<FoundationContext> {
  console.log("🌱 Seeding foundation (users, orgs, pricing)…");

  const seededUsers = [];
  for (const u of SEED_USERS) {
    seededUsers.push(await upsertUser(db, u));
  }
  const byEmail = Object.fromEntries(seededUsers.map(u => [u.email, u]));

  let [associationOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, "Asociación AlpaSur"))
    .limit(1);
  if (!associationOrg) {
    const [row] = await db
      .insert(organizations)
      .values({ name: "Asociación AlpaSur", type: "association", status: "active" })
      .returning();
    associationOrg = row!;
  }

  let [buyerOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, "Andes Textile Import LLC"))
    .limit(1);
  if (!buyerOrg) {
    const [row] = await db
      .insert(organizations)
      .values({
        name: "Andes Textile Import LLC",
        type: "buyer",
        status: "active",
      })
      .returning();
    buyerOrg = row!;
  }

  const memberPairs = [
    {
      organizationId: associationOrg.id,
      userId: byEmail["alpasur@demo.alpacto"]!.id,
      memberRole: "admin",
    },
    {
      organizationId: associationOrg.id,
      userId: byEmail["martina@demo.alpacto"]!.id,
      memberRole: "producer",
    },
    {
      organizationId: buyerOrg.id,
      userId: byEmail["andes@demo.alpacto"]!.id,
      memberRole: "admin",
    },
  ];
  for (const m of memberPairs) {
    await db.insert(organizationMembers).values(m).onConflictDoNothing();
  }

  const penPerUsdcMicros = BigInt(process.env["DEMO_PEN_PER_USDC_MICROS"] ?? "3750000");

  let [policy] = await db
    .select()
    .from(pricingPolicies)
    .where(eq(pricingPolicies.policyHash, DEMO_POLICY_HASH))
    .limit(1);
  if (!policy) {
    const [row] = await db
      .insert(pricingPolicies)
      .values({
        version: 1,
        currency: "PEN",
        associationFeeBps: 300,
        platformFeeBps: 50,
        weightToleranceBps: 100,
        penPerUsdcMicros,
        policyHash: DEMO_POLICY_HASH,
      })
      .returning();
    policy = row!;
  } else if (policy.penPerUsdcMicros <= 0n || policy.platformFeeBps !== 50) {
    const [row] = await db
      .update(pricingPolicies)
      .set({
        ...(policy.penPerUsdcMicros <= 0n ? { penPerUsdcMicros } : {}),
        platformFeeBps: 50,
      })
      .where(eq(pricingPolicies.id, policy.id))
      .returning();
    policy = row!;
  }

  await ensureDemoPolicyCategories(db, policy.id);

  console.log("  foundation ok —", SEED_USERS.map(u => u.email).join(", "));

  return { byEmail, associationOrg, buyerOrg, policy };
}
