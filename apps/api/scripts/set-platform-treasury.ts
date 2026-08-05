/**
 * After Sepolia deploy: set platform_treasury on AlpactoCore to the treasury EOA.
 *
 *   yarn workspace @alpacto/api set-platform-treasury
 *   (or) tsx apps/api/scripts/set-platform-treasury.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const CORE = (process.env["ALPACTO_CONTRACT_ADDRESS"] || "") as Address;
let key = (process.env["TREASURY_PRIVATE_KEY"] || process.env["PRIVATE_KEY_SEPOLIA"] || "") as string;
if (!key.startsWith("0x")) key = `0x${key}`;

const abi = parseAbi([
  "function setPlatformTreasury(address treasury)",
  "function platformTreasury() view returns (address)",
]);

async function main() {
  if (!CORE) throw new Error("ALPACTO_CONTRACT_ADDRESS missing");
  if (!key || key === "0x") throw new Error("TREASURY_PRIVATE_KEY missing");

  const account = privateKeyToAccount(key as Hex);
  const rpc =
    process.env["ARBITRUM_RPC_URL"] || "https://sepolia-rollup.arbitrum.io/rpc";
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpc),
  });
  const wallet = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpc),
  });

  console.log("📜 Core:", CORE);
  console.log("🏦 Platform treasury →", account.address);

  const hash = await wallet.writeContract({
    address: CORE,
    abi,
    functionName: "setPlatformTreasury",
    args: [account.address],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  const set = await publicClient.readContract({
    address: CORE,
    abi,
    functionName: "platformTreasury",
  });
  console.log("✅ platformTreasury:", set);
  console.log("   tx:", `https://sepolia.arbiscan.io/tx/${hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
