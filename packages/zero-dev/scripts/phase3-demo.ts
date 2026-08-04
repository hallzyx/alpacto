/**
 * Phase 3 checkpoint — ZeroDev sponsored producer reweigh on Arbitrum Sepolia.
 *
 *   yarn deploy --network sepolia   # once
 *   yarn phase3
 */
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import {
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  generateOwnerKey,
  loadZeroDevConfigFromEnv,
  setupAyniSessionKey,
  trySponsoredThenSelfFunded,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
dotenvConfig({ path: path.join(root, "packages/contracts/.env") });
dotenvConfig({ path: path.join(root, ".env") });

const CORE = (process.env["ALPACTO_CONTRACT_ADDRESS"] || "") as Address;
const USDC = (process.env["USDC_TOKEN_ADDRESS"] ||
  "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d") as Address;

const alpactoAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function buyerRole() view returns (bytes32)",
  "function associationRole() view returns (bytes32)",
  "function inspectorRole() view returns (bytes32)",
  "function auditorAgentRole() view returns (bytes32)",
  "function platformAdminRole() view returns (bytes32)",
  "function createOrder(uint256 orderId, address buyer, address association, bytes32 pricingPolicyHash, uint256 budgetUsdcUnits)",
  "function fundOrder(uint256 orderId, uint256 amount, bytes32 paymentReferenceHash)",
  "function registerLot(uint256 orderId, uint256 lotId, address producerAccount)",
  "function submitInspectionReference(uint256 lotId, uint32 version, uint64 weightGrams, uint32 categoryCode, bytes32 evidenceHash)",
  "function submitAuditAttestation(uint256 lotId, uint32 version, bytes32 reportHash, uint8 result)",
  "function requestReweighing(uint256 lotId, bytes32 reasonHash)",
  "function getLot(uint256 lotId) view returns (uint256, address, uint8, uint32, uint32, bytes32, uint256, uint256, uint256, bool)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

function writeEnvKey(file: string, key: string, value: string) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return;
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
  if (!CORE) throw new Error("ALPACTO_CONTRACT_ADDRESS missing — deploy to Sepolia first");

  let adminKey = (process.env["PRIVATE_KEY_SEPOLIA"] ||
    process.env["TREASURY_PRIVATE_KEY"] ||
    "") as string;
  if (!adminKey) throw new Error("PRIVATE_KEY_SEPOLIA or TREASURY_PRIVATE_KEY required");
  if (!adminKey.startsWith("0x")) adminKey = `0x${adminKey}`;
  const normalizedAdmin = adminKey as Hex;

  const zd = loadZeroDevConfigFromEnv();
  const rpc =
    zd.publicRpc ||
    process.env["RPC_URL_SEPOLIA"] ||
    "https://sepolia-rollup.arbitrum.io/rpc";
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpc),
  });
  const zdPublic = createAlpactoPublicClient({ ...zd, publicRpc: rpc });

  const admin = privateKeyToAccount(normalizedAdmin);
  const adminWallet = createWalletClient({
    account: admin,
    chain: arbitrumSepolia,
    transport: http(rpc),
  });

  console.log("👤 Admin:", admin.address);
  console.log("📜 AlpactoCore:", CORE);

  const producerKey = generateOwnerKey();
  const inspectorKey = generateOwnerKey();
  const associationKey = generateOwnerKey();
  const buyerKey = generateOwnerKey();

  const producerAccount = await createEcdsaKernelAccount(zdPublic, producerKey);
  const inspectorAccount = await createEcdsaKernelAccount(zdPublic, inspectorKey);
  const associationAccount = await createEcdsaKernelAccount(zdPublic, associationKey);
  const buyerAccount = await createEcdsaKernelAccount(zdPublic, buyerKey);

  console.log("🔐 Producer SA:", producerAccount.address);
  console.log("🔐 Inspector SA:", inspectorAccount.address);

  console.log("🧬 Setting up Ayni session key…");
  const ayni = await setupAyniSessionKey({
    publicClient: zdPublic,
    config: zd,
    alpactoCore: CORE,
  });
  writeEnvKey(path.join(root, ".env"), "AYNI_SESSION_KEY", ayni.sessionPrivateKey);
  writeEnvKey(path.join(root, ".env"), "AYNI_SMART_ACCOUNT", ayni.ayniSmartAccountAddress);
  console.log("🤖 Ayni SA:", ayni.ayniSmartAccountAddress);

  const [buyerRole, associationRole, inspectorRole, auditorRole, platformAdminRole] =
    await Promise.all([
      publicClient.readContract({ address: CORE, abi: alpactoAbi, functionName: "buyerRole" }),
      publicClient.readContract({
        address: CORE,
        abi: alpactoAbi,
        functionName: "associationRole",
      }),
      publicClient.readContract({
        address: CORE,
        abi: alpactoAbi,
        functionName: "inspectorRole",
      }),
      publicClient.readContract({
        address: CORE,
        abi: alpactoAbi,
        functionName: "auditorAgentRole",
      }),
      publicClient.readContract({
        address: CORE,
        abi: alpactoAbi,
        functionName: "platformAdminRole",
      }),
    ]);

  console.log("🎫 Granting roles…");
  for (const [role, account] of [
    [buyerRole, buyerAccount.address],
    [associationRole, associationAccount.address],
    [inspectorRole, inspectorAccount.address],
    [auditorRole, ayni.ayniSmartAccountAddress],
    [platformAdminRole, admin.address],
  ] as const) {
    const hash = await adminWallet.writeContract({
      address: CORE,
      abi: alpactoAbi,
      functionName: "grantRole",
      args: [role, account],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  const budget = 10_000_000n;
  const usdcBal = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [admin.address],
  });
  console.log("💵 Admin USDC:", usdcBal.toString());
  if (usdcBal < budget) {
    throw new Error(
      `Need at least ${budget} USDC units. Faucet: https://faucet.circle.com (Arbitrum Sepolia)`,
    );
  }

  const approveHash = await adminWallet.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [CORE, budget],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const orderId = BigInt(Date.now() % 1_000_000_000);
  const lotId = orderId + 7n;
  const policyHash = keccak256(toBytes("phase3-policy"));

  const fundEth = async (to: Address) => {
    const bal = await publicClient.getBalance({ address: to });
    if (bal >= 10n ** 15n) return;
    const hash = await adminWallet.sendTransaction({
      to,
      value: 10n ** 16n, // 0.01 ETH
    });
    await publicClient.waitForTransactionReceipt({ hash });
  };

  console.log("📝 createOrder…");
  await trySponsoredThenSelfFunded({
    publicClient: zdPublic,
    account: buyerAccount,
    config: zd,
    fundEth,
    to: CORE,
    abi: alpactoAbi,
    functionName: "createOrder",
    args: [
      orderId,
      buyerAccount.address,
      associationAccount.address,
      policyHash,
      budget,
    ],
  });

  console.log("💰 fundOrder (admin EOA)…");
  const fundTx = await adminWallet.writeContract({
    address: CORE,
    abi: alpactoAbi,
    functionName: "fundOrder",
    args: [orderId, budget, keccak256(toBytes(`phase3-pay-${orderId}`))],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundTx });

  console.log("📦 registerLot…");
  await trySponsoredThenSelfFunded({
    publicClient: zdPublic,
    account: associationAccount,
    config: zd,
    fundEth,
    to: CORE,
    abi: alpactoAbi,
    functionName: "registerLot",
    args: [orderId, lotId, producerAccount.address],
  });

  console.log("⚖️  inspection v1…");
  await trySponsoredThenSelfFunded({
    publicClient: zdPublic,
    account: inspectorAccount,
    config: zd,
    fundEth,
    to: CORE,
    abi: alpactoAbi,
    functionName: "submitInspectionReference",
    args: [lotId, 1, 42500n, 1, keccak256(toBytes("evidence-v1"))],
  });

  console.log("🕵️  Ayni attestation REVIEW_REQUIRED…");
  try {
    await trySponsoredThenSelfFunded({
      publicClient: zdPublic,
      account: await createEcdsaKernelAccount(zdPublic, ayni.ayniOwnerKey),
      config: zd,
      fundEth,
      to: CORE,
      abi: alpactoAbi,
      functionName: "submitAuditAttestation",
      args: [lotId, 1, keccak256(toBytes("report-v1")), 2],
    });
  } catch (err) {
    console.warn("Ayni attestation failed:", err);
    throw err;
  }

  console.log("🔁 requestReweighing (producer Kernel, no MetaMask)…");
  const { userOpHash, receipt } = await trySponsoredThenSelfFunded({
    publicClient: zdPublic,
    account: producerAccount,
    config: zd,
    fundEth,
    to: CORE,
    abi: alpactoAbi,
    functionName: "requestReweighing",
    args: [lotId, keccak256(toBytes("weight-mismatch"))],
  });

  const lot = await publicClient.readContract({
    address: CORE,
    abi: alpactoAbi,
    functionName: "getLot",
    args: [lotId],
  });

  console.log("\n📊 Result");
  console.log("  userOpHash:", userOpHash);
  console.log("  txHash:", receipt.receipt.transactionHash);
  console.log("  lot status:", lot[2], "(5 = ReweighingRequested)");
  console.log("\n🎉 Phase 3 checkpoint complete — reweigh without MetaMask/gas");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
