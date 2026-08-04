/**
 * Provision real ZeroDev Kernel smart accounts for seed users on Arbitrum Sepolia.
 *
 *   yarn db:seed && yarn seed:wallets
 *
 * Writes:
 *   - users.smart_account_address in Postgres
 *   - .secrets/demo-wallets.json (gitignored) — owner keys for ops/debug
 *   - DEMO_BUYER_SMART_ACCOUNT / DEMO_ASSOCIATION_SMART_ACCOUNT in root .env
 *
 * Optional (if ALPACTO_CONTRACT_ADDRESS + TREASURY_PRIVATE_KEY):
 *   - grant on-chain roles
 *   - fund SA with dust ETH for self-funded UserOps
 */
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { eq } from "drizzle-orm";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { createDb, users } from "@alpacto/database";
import {
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  deriveDemoOwnerKey,
  loadZeroDevConfigFromEnv,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
dotenvConfig({ path: path.join(root, ".env") });

const DEFAULT_SEED = "alpacto-local-demo-wallet-seed-v1";
const ARBISCAN = "https://sepolia.arbiscan.io/address";

const SEED_WALLETS = [
  { email: "martina@demo.alpacto", role: "producer", grant: null },
  { email: "carlos@demo.alpacto", role: "inspector", grant: "inspectorRole" as const },
  { email: "alpasur@demo.alpacto", role: "association", grant: "associationRole" as const },
  { email: "andes@demo.alpacto", role: "buyer", grant: "buyerRole" as const },
  { email: "admin@demo.alpacto", role: "admin", grant: null },
] as const;

const alpactoAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function buyerRole() view returns (bytes32)",
  "function associationRole() view returns (bytes32)",
  "function inspectorRole() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
]);

function writeEnvKey(file: string, key: string, value: string) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, `${key}=${value}\n`);
    return;
  }
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  let found = false;
  const out = lines.map((l) => {
    if (l.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return l;
  });
  if (!found) out.push(`${key}=${value}`);
  fs.writeFileSync(
    p,
    `${out.filter((l, i) => !(i === out.length - 1 && l === "")).join("\n")}\n`,
  );
}

async function main() {
  const masterSeed = (process.env["DEMO_WALLET_SEED"] || "").trim() || DEFAULT_SEED;
  if (!process.env["DEMO_WALLET_SEED"]?.trim()) {
    console.warn(
      `⚠️  DEMO_WALLET_SEED unset — using default "${DEFAULT_SEED}". Set it in .env for a stable personal seed.`,
    );
  }

  const dbUrl =
    process.env["DATABASE_URL"] ??
    "postgresql://alpacto:alpacto@localhost:5432/alpacto";
  const { db, pool } = createDb(dbUrl);

  const zd = loadZeroDevConfigFromEnv();
  const rpc =
    zd.publicRpc ||
    process.env["ARBITRUM_RPC_URL"] ||
    "https://sepolia-rollup.arbitrum.io/rpc";
  const zdPublic = createAlpactoPublicClient({ ...zd, publicRpc: rpc });
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpc),
  });

  console.log("🔗 Chain: Arbitrum Sepolia (421614)");
  console.log("🔗 RPC:", rpc);
  console.log("🔐 Provisioning Kernel smart accounts for seed users…\n");

  const records: Array<{
    email: string;
    role: string;
    smartAccountAddress: Address;
    ownerKey: Hex;
    ownerAddress: Address;
  }> = [];

  for (const seed of SEED_WALLETS) {
    const [user] = await db.select().from(users).where(eq(users.email, seed.email)).limit(1);
    if (!user) {
      throw new Error(`User ${seed.email} missing — run yarn db:seed first`);
    }

    const ownerKey = deriveDemoOwnerKey(masterSeed, seed.email);
    const owner = privateKeyToAccount(ownerKey);
    const account = await createEcdsaKernelAccount(zdPublic, ownerKey);
    const address = account.address;

    if (
      user.smartAccountAddress &&
      user.smartAccountAddress.toLowerCase() !== address.toLowerCase()
    ) {
      console.warn(
        `  ↻ ${seed.email}: replacing ${user.smartAccountAddress} → ${address} (seed/key changed)`,
      );
    }

    await db
      .update(users)
      .set({ smartAccountAddress: address, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const code = await publicClient.getBytecode({ address });
    console.log(`✅ ${seed.role.padEnd(12)} ${seed.email}`);
    console.log(`   Kernel SA: ${address}`);
    console.log(`   Owner EOA: ${owner.address}`);
    console.log(`   Explorer:  ${ARBISCAN}/${address}`);
    console.log(`   Bytecode:  ${code && code !== "0x" ? "deployed/counterfactual ready" : "counterfactual (deploys on first UserOp)"}`);
    console.log("");

    records.push({
      email: seed.email,
      role: seed.role,
      smartAccountAddress: address,
      ownerKey,
      ownerAddress: owner.address,
    });
  }

  const secretsDir = path.join(root, ".secrets");
  fs.mkdirSync(secretsDir, { recursive: true });
  const secretsPath = path.join(secretsDir, "demo-wallets.json");
  fs.writeFileSync(
    secretsPath,
    `${JSON.stringify(
      {
        chainId: 421614,
        chain: "arbitrumSepolia",
        masterSeedHint: masterSeed.slice(0, 8) + "…",
        createdAt: new Date().toISOString(),
        wallets: records.map((r) => ({
          email: r.email,
          role: r.role,
          smartAccountAddress: r.smartAccountAddress,
          ownerAddress: r.ownerAddress,
          ownerKey: r.ownerKey,
        })),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`🔒 Owner keys → ${path.relative(root, secretsPath)} (gitignored)\n`);

  const buyer = records.find((r) => r.email === "andes@demo.alpacto")!;
  const association = records.find((r) => r.email === "alpasur@demo.alpacto")!;
  const envPath = path.join(root, ".env");
  writeEnvKey(envPath, "DEMO_BUYER_SMART_ACCOUNT", buyer.smartAccountAddress);
  writeEnvKey(envPath, "DEMO_ASSOCIATION_SMART_ACCOUNT", association.smartAccountAddress);
  console.log("📝 Updated .env DEMO_BUYER_SMART_ACCOUNT / DEMO_ASSOCIATION_SMART_ACCOUNT");

  const core = (process.env["ALPACTO_CONTRACT_ADDRESS"] || "") as Address;
  let adminKey = (process.env["TREASURY_PRIVATE_KEY"] ||
    process.env["PRIVATE_KEY_SEPOLIA"] ||
    "") as string;

  if (core && adminKey) {
    if (!adminKey.startsWith("0x")) adminKey = `0x${adminKey}`;
    const admin = privateKeyToAccount(adminKey as Hex);
    const adminWallet = createWalletClient({
      account: admin,
      chain: arbitrumSepolia,
      transport: http(rpc),
    });

    console.log("\n🎫 Granting AlpactoCore roles on Sepolia…");
    const [buyerRole, associationRole, inspectorRole] = await Promise.all([
      publicClient.readContract({ address: core, abi: alpactoAbi, functionName: "buyerRole" }),
      publicClient.readContract({
        address: core,
        abi: alpactoAbi,
        functionName: "associationRole",
      }),
      publicClient.readContract({
        address: core,
        abi: alpactoAbi,
        functionName: "inspectorRole",
      }),
    ]);

    const grants: Array<{ role: Hex; account: Address; label: string }> = [
      { role: buyerRole, account: buyer.smartAccountAddress, label: "buyer→andes" },
      {
        role: associationRole,
        account: association.smartAccountAddress,
        label: "association→alpasur",
      },
      {
        role: inspectorRole,
        account: records.find((r) => r.email === "carlos@demo.alpacto")!.smartAccountAddress,
        label: "inspector→carlos",
      },
    ];

    for (const g of grants) {
      const has = await publicClient.readContract({
        address: core,
        abi: alpactoAbi,
        functionName: "hasRole",
        args: [g.role, g.account],
      });
      if (has) {
        console.log(`   skip ${g.label} (already granted)`);
        continue;
      }
      const hash = await adminWallet.writeContract({
        address: core,
        abi: alpactoAbi,
        functionName: "grantRole",
        args: [g.role, g.account],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`   granted ${g.label} tx=${hash}`);
    }

    console.log("\n⛽ Funding Kernel SAs with dust ETH (if needed)…");
    const minBal = parseEther("0.001");
    const sendAmt = parseEther("0.01");
    for (const r of records) {
      const bal = await publicClient.getBalance({ address: r.smartAccountAddress });
      if (bal >= minBal) {
        console.log(`   ${r.email}: bal=${bal} (ok)`);
        continue;
      }
      const hash = await adminWallet.sendTransaction({
        to: r.smartAccountAddress,
        value: sendAmt,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`   ${r.email}: funded 0.01 ETH tx=${hash}`);
    }
  } else {
    console.warn(
      "\n⚠️  Skip on-chain roles/funding — set ALPACTO_CONTRACT_ADDRESS + TREASURY_PRIVATE_KEY (or PRIVATE_KEY_SEPOLIA).",
    );
  }

  console.log("\n✅ Seed wallets ready on Arbitrum Sepolia.");
  console.log("   demo-login users now carry real Kernel addresses.");
  console.log("   Verify e.g.:", `${ARBISCAN}/${buyer.smartAccountAddress}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
