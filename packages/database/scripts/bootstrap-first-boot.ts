/**
 * First-boot only: db seed + Kernel wallets when Postgres has no demo wallets yet.
 * Compose service `bootstrap` runs this after migrate; no-ops when data already exists.
 */
import { spawnSync } from "node:child_process";
import { count, eq } from "drizzle-orm";
import { createDb, users } from "../src/index.js";

function run(label: string, command: string, args: string[]) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.env["BOOTSTRAP_CWD"] || "/app",
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? "unknown"}`);
  }
}

async function main() {
  if (process.env["SKIP_BOOTSTRAP"] === "1" || process.env["SKIP_BOOTSTRAP"] === "true") {
    console.log("Bootstrap skipped (SKIP_BOOTSTRAP=1)");
    return;
  }

  const url =
    process.env["DATABASE_URL"] ??
    "postgresql://alpacto:alpacto@postgres:5432/alpacto";
  const { db, pool } = createDb(url);

  try {
    const [totalRow] = await db.select({ n: count() }).from(users);
    const totalUsers = Number(totalRow?.n ?? 0);

    const [martina] = await db
      .select({
        id: users.id,
        smartAccountAddress: users.smartAccountAddress,
      })
      .from(users)
      .where(eq(users.email, "martina@demo.alpacto"))
      .limit(1);

    if (martina?.smartAccountAddress?.trim()) {
      console.log(
        `Bootstrap skip: demo data already present (${totalUsers} user(s), wallets provisioned).`,
      );
      return;
    }

    if (totalUsers === 0) {
      run("db:seed (first boot)", "yarn", ["workspace", "@alpacto/database", "seed"]);
    } else {
      console.log(
        `Users exist (${totalUsers}) but demo Kernel wallets missing — seeding wallets only.`,
      );
    }

    const zd = process.env["ZERODEV_PROJECT_ID"]?.trim();
    const bundler = process.env["ZERODEV_BUNDLER_RPC"]?.trim();
    if (!zd || !bundler) {
      console.warn(
        "⚠️  Skipping seed:wallets — set ZERODEV_PROJECT_ID and ZERODEV_BUNDLER_RPC for Kernel SAs.",
      );
      return;
    }

    if (!process.env["DEMO_WALLET_SEED"]?.trim()) {
      process.env["DEMO_WALLET_SEED"] = "alpacto-local-demo-wallet-seed-v1";
      console.log("DEMO_WALLET_SEED unset — using alpacto-local-demo-wallet-seed-v1");
    }

    run("seed:wallets (first boot)", "yarn", [
      "workspace",
      "@alpacto/zero-dev",
      "seed:wallets",
    ]);
    console.log("\n✅ First-boot bootstrap complete");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
