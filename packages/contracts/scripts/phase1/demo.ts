/**
 * Phase 1 onchain demo (Nitro + yarn deploy).
 *
 *   yarn phase1
 *   yarn phase1 -- --flow=reweigh
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toBytes,
  type Address,
  type Chain,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { getChain, getPrivateKey, getRpcUrlFromChain } from "../utils/network";

dotenvConfig({ path: path.resolve(__dirname, "../../.env") });

const chain = getChain("devnet") as Chain;
const RPC = process.env["RPC_URL"] || getRpcUrlFromChain(chain);
const ADMIN_KEY = (process.env["PRIVATE_KEY"] || getPrivateKey("devnet")) as Hex;

/** Well-known Hardhat/Anvil accounts #0–#4 (funded from Nitro admin). */
const DEMO_KEYS = {
  buyer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  association: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b733a39",
  inspector: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  auditor: "0x7c852118294e51e653712a81e05800f419141751be58f76a2c0b1ba5c9d10c35",
  producer: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348f870268eefc09",
} as const satisfies Record<string, Hex>;

const mockUsdcAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 value) returns (bool)",
]);

const alpactoAbi = parseAbi([
  "function platformAdminRole() view returns (bytes32)",
  "function associationRole() view returns (bytes32)",
  "function buyerRole() view returns (bytes32)",
  "function inspectorRole() view returns (bytes32)",
  "function auditorAgentRole() view returns (bytes32)",
  "function grantRole(bytes32 role, address account)",
  "function createOrder(uint256 orderId, address buyer, address association, bytes32 pricingPolicyHash, uint256 budgetUsdcUnits)",
  "function fundOrder(uint256 orderId, uint256 amount, bytes32 paymentReferenceHash)",
  "function registerLot(uint256 orderId, uint256 lotId, address producerAccount)",
  "function submitInspectionReference(uint256 lotId, uint32 version, uint64 weightGrams, uint32 categoryCode, bytes32 evidenceHash)",
  "function submitAuditAttestation(uint256 lotId, uint32 version, bytes32 reportHash, uint8 result)",
  "function requestReweighing(uint256 lotId, bytes32 reasonHash)",
  "function acceptSettlement(uint256 lotId, uint32 version, bytes32 quoteHash, uint256 netPenMinor, uint256 producerUsdcUnits, uint256 associationUsdcUnits, uint256 platformUsdcUnits)",
  "function settleLot(uint256 lotId)",
  "function getOrder(uint256 orderId) view returns (address, address, bytes32, uint256, uint256, uint256, uint8, bool)",
  "function getLot(uint256 lotId) view returns (uint256, address, uint8, uint32, uint32, bytes32, uint256, uint256, uint256, uint256, bool)",
]);

function loadDeployed(chainId: string) {
  const jsonPath = path.resolve(__dirname, `../../deployments/${chainId}_latest.json`);
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Missing ${jsonPath}. Run yarn deploy first.`);
  }
  return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<
    string,
    { address: string }
  >;
}

function wallet(account: PrivateKeyAccount) {
  return createWalletClient({
    account,
    chain,
    transport: http(RPC),
  });
}

async function write(
  client: ReturnType<typeof wallet>,
  params: Omit<Parameters<ReturnType<typeof wallet>["writeContract"]>[0], "chain" | "account">,
) {
  return client.writeContract({
    ...params,
    chain,
    account: client.account,
  } as Parameters<ReturnType<typeof wallet>["writeContract"]>[0]);
}

async function main() {
  const flow = process.argv.includes("--flow=reweigh") ? "reweigh" : "happy";
  const chainId = String(chain.id);
  const deployed = loadDeployed(chainId);
  const usdc = deployed["mock-usdc"]?.address as Address | undefined;
  const core = deployed["alpacto-core"]?.address as Address | undefined;
  if (!usdc || !core) {
    throw new Error("mock-usdc / alpacto-core missing. Run yarn deploy.");
  }

  const admin = privateKeyToAccount(ADMIN_KEY);
  const demo = {
    buyer: privateKeyToAccount(DEMO_KEYS.buyer),
    association: privateKeyToAccount(DEMO_KEYS.association),
    inspector: privateKeyToAccount(DEMO_KEYS.inspector),
    auditor: privateKeyToAccount(DEMO_KEYS.auditor),
    producer: privateKeyToAccount(DEMO_KEYS.producer),
  };

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC),
  });
  const adminWallet = wallet(admin);

  console.log("🔧 Funding demo accounts from admin…");
  for (const who of Object.values(demo)) {
    await adminWallet.sendTransaction({
      to: who.address,
      value: 10n ** 17n,
      chain,
      account: admin,
    });
  }

  const [
    platformAdminRole,
    buyerRole,
    associationRole,
    inspectorRole,
    auditorRole,
  ] = await Promise.all([
    publicClient.readContract({ address: core, abi: alpactoAbi, functionName: "platformAdminRole" }),
    publicClient.readContract({ address: core, abi: alpactoAbi, functionName: "buyerRole" }),
    publicClient.readContract({ address: core, abi: alpactoAbi, functionName: "associationRole" }),
    publicClient.readContract({ address: core, abi: alpactoAbi, functionName: "inspectorRole" }),
    publicClient.readContract({ address: core, abi: alpactoAbi, functionName: "auditorAgentRole" }),
  ]);

  console.log("🔐 Granting roles…");
  for (const [role, account] of [
    [platformAdminRole, admin.address],
    [buyerRole, demo.buyer.address],
    [associationRole, demo.association.address],
    [inspectorRole, demo.inspector.address],
    [auditorRole, demo.auditor.address],
  ] as const) {
    await write(adminWallet, {
      address: core,
      abi: alpactoAbi,
      functionName: "grantRole",
      args: [role, account],
    });
  }

  const budget = 1_000_000_000n; // 1000 mUSDC
  console.log("💵 Mint + approve USDC…");
  await write(adminWallet, {
    address: usdc,
    abi: mockUsdcAbi,
    functionName: "mint",
    args: [admin.address, budget],
  });
  await write(adminWallet, {
    address: usdc,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [core, budget],
  });

  const orderId = BigInt(Date.now() % 1_000_000_000);
  const lotId = orderId + 10n;
  const policyHash = keccak256(toBytes("demo-pricing-v1"));

  console.log("📝 createOrder", orderId.toString());
  await write(wallet(demo.buyer), {
    address: core,
    abi: alpactoAbi,
    functionName: "createOrder",
    args: [orderId, demo.buyer.address, demo.association.address, policyHash, budget],
  });

  console.log("💰 fundOrder");
  await write(adminWallet, {
    address: core,
    abi: alpactoAbi,
    functionName: "fundOrder",
    args: [orderId, budget, keccak256(toBytes(`pay-${flow}-${orderId}`))],
  });

  console.log("📦 registerLot");
  await write(wallet(demo.association), {
    address: core,
    abi: alpactoAbi,
    functionName: "registerLot",
    args: [orderId, lotId, demo.producer.address],
  });

  let acceptVersion = 1;
  if (flow === "reweigh") {
    console.log("⚖️  inspection v1 → REVIEW_REQUIRED");
    await write(wallet(demo.inspector), {
      address: core,
      abi: alpactoAbi,
      functionName: "submitInspectionReference",
      args: [lotId, 1, 42500n, 1, keccak256(toBytes("evidence-v1"))],
    });
    await write(wallet(demo.auditor), {
      address: core,
      abi: alpactoAbi,
      functionName: "submitAuditAttestation",
      args: [lotId, 1, keccak256(toBytes("report-v1")), 2],
    });
    console.log("🔁 requestReweighing");
    await write(wallet(demo.producer), {
      address: core,
      abi: alpactoAbi,
      functionName: "requestReweighing",
      args: [lotId, keccak256(toBytes("weight-mismatch"))],
    });
    console.log("⚖️  inspection v2 → PASS");
    await write(wallet(demo.inspector), {
      address: core,
      abi: alpactoAbi,
      functionName: "submitInspectionReference",
      args: [lotId, 2, 41500n, 1, keccak256(toBytes("evidence-v2"))],
    });
    await write(wallet(demo.auditor), {
      address: core,
      abi: alpactoAbi,
      functionName: "submitAuditAttestation",
      args: [lotId, 2, keccak256(toBytes("report-v2")), 0],
    });
    acceptVersion = 2;
  } else {
    console.log("⚖️  inspection v1 → PASS");
    await write(wallet(demo.inspector), {
      address: core,
      abi: alpactoAbi,
      functionName: "submitInspectionReference",
      args: [lotId, 1, 41500n, 1, keccak256(toBytes("evidence-v1"))],
    });
    await write(wallet(demo.auditor), {
      address: core,
      abi: alpactoAbi,
      functionName: "submitAuditAttestation",
      args: [lotId, 1, keccak256(toBytes("report-v1")), 0],
    });
  }

  console.log("✅ acceptSettlement + settleLot");
  await write(wallet(demo.producer), {
    address: core,
    abi: alpactoAbi,
    functionName: "acceptSettlement",
    args: [
      lotId,
      acceptVersion,
      keccak256(toBytes(`quote-v${acceptVersion}`)),
      100_000n,
      800_000_000n,
      200_000_000n,
      0n,
    ],
  });
  await write(wallet(demo.producer), {
    address: core,
    abi: alpactoAbi,
    functionName: "settleLot",
    args: [lotId],
  });

  const order = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "getOrder",
    args: [orderId],
  });
  const lot = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "getLot",
    args: [lotId],
  });

  console.log("\n📊 Result");
  console.log("  mock-usdc:", usdc);
  console.log("  alpacto-core:", core);
  console.log("  order remaining:", order[5].toString(), "status:", order[6]);
  console.log("  lot status:", lot[2], "version:", lot[3]);
  console.log(`\n🎉 Phase 1 ${flow} flow complete`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
