import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { count } from "drizzle-orm";
import { createDb } from "./index.js";
import { campaigns } from "./schema/index.js";
import { clearTransactions } from "./seed/clear-transactions.js";
import { SEED_USERS, seedFoundation } from "./seed/foundation.js";
import { seedMockTransactions } from "./seed/mock-transactions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function campaignCount(db: ReturnType<typeof createDb>["db"]): Promise<number> {
  const [row] = await db.select({ n: count() }).from(campaigns);
  return Number(row?.n ?? 0);
}

async function main() {
  const url =
    process.env["DATABASE_URL"] ??
    "postgresql://alpacto:alpacto@localhost:5432/alpacto";
  const resetTx =
    process.env["SEED_RESET_TRANSACTIONS"] === "1" ||
    process.env["SEED_RESET_TRANSACTIONS"] === "true";

  const { db, pool } = createDb(url);

  console.log("🌱 Alpacto seed");
  console.log(`  DATABASE_URL host ok`);
  console.log(`  SEED_RESET_TRANSACTIONS=${resetTx ? "1" : "0"}`);

  const foundation = await seedFoundation(db);

  const existingCampaigns = await campaignCount(db);
  const shouldSeedTx = resetTx || existingCampaigns === 0;

  if (resetTx) {
    await clearTransactions(db);
  }

  if (shouldSeedTx) {
    const mock = await seedMockTransactions(db, foundation);
    console.log("✅ Seed complete (foundation + mock transactions)");
    console.log("  campaigns:", mock.campaignIds.length);
    console.log("  orders:", mock.orderRefs.join(", "));
    console.log("  lots:", mock.lotCount);
  } else {
    console.log("✅ Seed complete (foundation only — transactions preserved)");
    console.log(
      `  skipped mock: ${existingCampaigns} campaign(s) already present (set SEED_RESET_TRANSACTIONS=1 to wipe+reseed)`,
    );
  }

  console.log("  demo logins:", SEED_USERS.map(u => u.email).join(", "));
  console.log(
    "  → Next: yarn seed:wallets  # real Kernel SAs on Arbitrum Sepolia for each seed user",
  );

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
