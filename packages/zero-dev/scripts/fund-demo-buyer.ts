/**
 * Transfer Circle test USDC from treasury EOA → demo buyer Kernel SA.
 *
 *   yarn fund-demo-buyer
 *   yarn fund-demo-buyer -- --amount 100
 *   yarn fund-demo-buyer -- --email andes@demo.alpacto --amount 50
 *
 * Prerequisites: treasury has USDC from https://faucet.circle.com (Arbitrum Sepolia)
 * and yarn seed:wallets has provisioned the buyer SA.
 */
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { deriveDemoOwnerKey, createEcdsaKernelAccount, createAlpactoPublicClient, loadZeroDevConfigFromEnv } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
dotenvConfig({ path: path.join(root, ".env") });

const USDC = (process.env["USDC_TOKEN_ADDRESS"] ||
  "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d") as Address;

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

type DemoWallet = {
  email: string;
  role: string;
  smartAccountAddress: string;
  ownerKey?: string;
};

function parseArgs(argv: string[]) {
  let email = "andes@demo.alpacto";
  let amountUsdc = 100;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email" && argv[i + 1]) {
      email = argv[++i]!;
    } else if (argv[i] === "--amount" && argv[i + 1]) {
      amountUsdc = Number(argv[++i]);
    }
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("--amount must be a positive number of whole USDC");
  }
  return { email, amountUsdc };
}

function loadBuyerSa(email: string): Address {
  const secretsPath = path.join(root, ".secrets/demo-wallets.json");
  if (fs.existsSync(secretsPath)) {
    const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8")) as
      | DemoWallet[]
      | { wallets?: DemoWallet[] };
    const wallets = Array.isArray(raw) ? raw : (raw.wallets ?? []);
    const row = wallets.find((w) => w.email.toLowerCase() === email.toLowerCase());
    if (row?.smartAccountAddress) return row.smartAccountAddress as Address;
  }
  const envBuyer = process.env["DEMO_BUYER_SMART_ACCOUNT"];
  if (envBuyer && email.toLowerCase() === "andes@demo.alpacto") {
    return envBuyer as Address;
  }
  throw new Error(
    `Buyer SA not found for ${email}. Run yarn seed:wallets first (writes .secrets/demo-wallets.json).`,
  );
}

async function main() {
  const { email, amountUsdc } = parseArgs(process.argv.slice(2));
  const amount = parseUnits(String(amountUsdc), 6);

  let treasuryKey = (process.env["TREASURY_PRIVATE_KEY"] ||
    process.env["PRIVATE_KEY_SEPOLIA"] ||
    "") as string;
  if (!treasuryKey) throw new Error("TREASURY_PRIVATE_KEY or PRIVATE_KEY_SEPOLIA required");
  if (!treasuryKey.startsWith("0x")) treasuryKey = `0x${treasuryKey}`;

  const rpc =
    process.env["ARBITRUM_RPC_URL"] ||
    process.env["RPC_URL_SEPOLIA"] ||
    "https://sepolia-rollup.arbitrum.io/rpc";

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpc),
  });
  const treasury = privateKeyToAccount(treasuryKey as Hex);
  const wallet = createWalletClient({
    account: treasury,
    chain: arbitrumSepolia,
    transport: http(rpc),
  });

  // Prefer secrets file; also verify Kernel derives to same address when seed present.
  let buyerSa = loadBuyerSa(email);
  const masterSeed = process.env["DEMO_WALLET_SEED"];
  if (masterSeed) {
    const zd = loadZeroDevConfigFromEnv();
    const zdPublic = createAlpactoPublicClient({ ...zd, publicRpc: rpc });
    const ownerKey = deriveDemoOwnerKey(masterSeed, email);
    const account = await createEcdsaKernelAccount(zdPublic, ownerKey);
    if (account.address.toLowerCase() !== buyerSa.toLowerCase()) {
      console.warn(
        `⚠️  Derived Kernel ${account.address} ≠ secrets ${buyerSa}; using derived address.`,
      );
      buyerSa = account.address;
    }
  }

  const [treasuryBal, buyerBefore] = await Promise.all([
    publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [treasury.address],
    }),
    publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [buyerSa],
    }),
  ]);

  console.log("🏦 Treasury:", treasury.address);
  console.log("🧵 Buyer SA:", buyerSa, `(${email})`);
  console.log("💵 Treasury USDC:", formatUnits(treasuryBal, 6));
  console.log("💵 Buyer USDC before:", formatUnits(buyerBefore, 6));
  console.log(`➡️  Transfer ${amountUsdc} USDC…`);

  if (treasuryBal < amount) {
    throw new Error(
      `Treasury has only ${formatUnits(treasuryBal, 6)} USDC; need ${amountUsdc}. ` +
        `Faucet: https://faucet.circle.com (Arbitrum Sepolia) → ${treasury.address}`,
    );
  }

  const hash = await wallet.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "transfer",
    args: [buyerSa, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  const buyerAfter = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [buyerSa],
  });

  console.log("✅ Tx:", hash);
  console.log("💵 Buyer USDC after:", formatUnits(buyerAfter, 6));
  console.log(`Explorer: https://sepolia.arbiscan.io/tx/${hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
