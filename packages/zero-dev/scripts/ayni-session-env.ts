/**
 * Regenerate Ayni session env vars (writes root .env).
 *
 *   yarn ayni:session
 *
 * Updates AYNI_SESSION_KEY, AYNI_SMART_ACCOUNT, AYNI_SERIALIZED_SESSION together
 * and grants AUDITOR_AGENT_ROLE to the new smart account.
 */
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount, type Hex } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import {
  createAlpactoPublicClient,
  loadZeroDevConfigFromEnv,
  setupAyniSessionKey,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
dotenvConfig({ path: path.join(root, ".env") });

const CORE = (process.env["ALPACTO_CONTRACT_ADDRESS"] || "") as Address;

const alpactoAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function auditorAgentRole() view returns (bytes32)",
]);

function writeEnvKey(file: string, key: string, value: string) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) throw new Error(`.env not found at ${p}`);
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
  fs.writeFileSync(p, `${out.filter((l, i) => !(i === out.length - 1 && l === "")).join("\n")}\n`);
}

async function main() {
  if (!CORE) throw new Error("ALPACTO_CONTRACT_ADDRESS missing");
  if (!process.env["ZERODEV_PROJECT_ID"]) {
    throw new Error("ZERODEV_PROJECT_ID missing");
  }

  let adminKey = (process.env["TREASURY_PRIVATE_KEY"] ||
    process.env["PRIVATE_KEY_SEPOLIA"] ||
    "") as string;
  if (!adminKey) throw new Error("TREASURY_PRIVATE_KEY or PRIVATE_KEY_SEPOLIA required");
  if (!adminKey.startsWith("0x")) adminKey = `0x${adminKey}`;

  const zd = loadZeroDevConfigFromEnv();
  const publicClient = createAlpactoPublicClient(zd);
  const adminWallet = createWalletClient({
    account: privateKeyToAccount(adminKey as Hex),
    chain: arbitrumSepolia,
    transport: http(zd.publicRpc ?? arbitrumSepolia.rpcUrls.default.http[0]),
  });

  console.log("🧬 Generating Ayni session (ZeroDev)…");
  const ayni = await setupAyniSessionKey({
    publicClient,
    config: zd,
    alpactoCore: CORE,
  });

  const envPath = path.join(root, ".env");
  writeEnvKey(envPath, "AYNI_SESSION_KEY", ayni.sessionPrivateKey);
  writeEnvKey(envPath, "AYNI_SMART_ACCOUNT", ayni.ayniSmartAccountAddress);
  writeEnvKey(envPath, "AYNI_SERIALIZED_SESSION", ayni.serializedSession);

  const auditorRole = await publicClient.readContract({
    address: CORE,
    abi: alpactoAbi,
    functionName: "auditorAgentRole",
  });
  const grantTx = await adminWallet.writeContract({
    address: CORE,
    abi: alpactoAbi,
    functionName: "grantRole",
    args: [auditorRole, ayni.ayniSmartAccountAddress],
  });
  await publicClient.waitForTransactionReceipt({ hash: grantTx });

  console.log("✅ Wrote to .env:");
  console.log("   AYNI_SMART_ACCOUNT=", ayni.ayniSmartAccountAddress);
  console.log("   AYNI_SESSION_KEY=0x… (hidden)");
  console.log("   AYNI_SERIALIZED_SESSION=<serialized blob>");
  console.log("   AUDITOR_AGENT_ROLE granted on", CORE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
