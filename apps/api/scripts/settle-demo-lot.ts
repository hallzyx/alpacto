/**
 * Execute on-chain settlement for a lot that was accepted off-chain.
 *
 *   yarn settle-demo-lot -- 47618adc-8ac2-46f6-a6f8-d49803841307
 */
import { createDb } from "@alpacto/database";
import { config } from "../src/config.js";
import { executeSettlementOnchain } from "../src/lib/settlement-onchain.js";

const lotId = process.argv.slice(2).find((arg) => arg !== "--" && !arg.startsWith("-"));
if (!lotId) {
  console.error("Usage: yarn settle-demo-lot -- <lot-uuid>");
  process.exit(1);
}

const { db, pool } = createDb(config.databaseUrl);

async function main() {
  console.log(`🔗 Settling lot ${lotId} on-chain…`);
  const txHash = await executeSettlementOnchain(db, lotId, (msg) => console.log(`  ${msg}`));
  console.log(`\n✅ USDC sent — tx: ${txHash}`);
  console.log(`   Explorer: https://sepolia.arbiscan.io/tx/${txHash}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
