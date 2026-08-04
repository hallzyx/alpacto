import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { createDb } from "./index.js";
import {
  campaigns,
  organizationMembers,
  orders,
  organizations,
  pricingCategories,
  pricingPolicies,
  users,
} from "./schema/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const DEMO_POLICY_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

const SEED_USERS = [
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

async function findUserByEmail(
  db: ReturnType<typeof createDb>["db"],
  email: string,
) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

async function upsertUser(
  db: ReturnType<typeof createDb>["db"],
  user: (typeof SEED_USERS)[number],
) {
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

async function main() {
  const url =
    process.env["DATABASE_URL"] ??
    "postgresql://alpacto:alpacto@localhost:5432/alpacto";
  const { db, pool } = createDb(url);

  console.log("🌱 Seeding Alpacto demo data…");

  const seededUsers = [];
  for (const u of SEED_USERS) {
    seededUsers.push(await upsertUser(db, u));
  }
  const byEmail = Object.fromEntries(seededUsers.map((u) => [u.email, u]));

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
    { organizationId: associationOrg.id, userId: byEmail["alpasur@demo.alpacto"]!.id, memberRole: "admin" },
    { organizationId: buyerOrg.id, userId: byEmail["andes@demo.alpacto"]!.id, memberRole: "admin" },
  ];
  for (const m of memberPairs) {
    await db.insert(organizationMembers).values(m).onConflictDoNothing();
  }

  const penPerUsdcMicros = BigInt(
    process.env["DEMO_PEN_PER_USDC_MICROS"] ?? "3750000",
  );

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
        weightToleranceBps: 100,
        penPerUsdcMicros,
        policyHash: DEMO_POLICY_HASH,
      })
      .returning();
    policy = row!;
    await db.insert(pricingCategories).values({
      pricingPolicyId: policy.id,
      code: "FINE",
      label: "Fino",
      pricePenMinorPerKg: 2750n,
      qualityBonusPenMinorPerKg: 0n,
    });
  }

  let [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.name, "Campaña Demo 2026"))
    .limit(1);
  if (!campaign) {
    const [row] = await db
      .insert(campaigns)
      .values({
        organizationId: associationOrg.id,
        buyerId: byEmail["andes@demo.alpacto"]!.id,
        name: "Campaña Demo 2026",
        status: "active",
        pricingPolicyId: policy.id,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      })
      .returning();
    campaign = row!;
  }

  let [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.externalRef, "ALP-2026-001"))
    .limit(1);
  if (!order) {
    const budgetUsdCents = 100_000n;
    const fundedUsdc = 1_000_000_000n;
    const [row] = await db
      .insert(orders)
      .values({
        externalRef: "ALP-2026-001",
        campaignId: campaign.id,
        buyerId: byEmail["andes@demo.alpacto"]!.id,
        associationId: associationOrg.id,
        budgetUsdCents,
        fundedUsdcUnits: fundedUsdc,
        remainingUsdcUnits: fundedUsdc,
        status: "funded",
      })
      .returning();
    order = row!;
  }

  console.log("✅ Seed complete");
  console.log("  campaign:", campaign.id);
  console.log("  order ALP-2026-001:", order.id);
  console.log("  demo logins:", SEED_USERS.map((u) => u.email).join(", "));
  console.log(
    "  → Next: yarn seed:wallets  # real Kernel SAs on Arbitrum Sepolia for each seed user",
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
