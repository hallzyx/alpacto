import {
  createPublicClient,
  createWalletClient,
  parseAbi,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { createPublicRpcTransport } from "@alpacto/zero-dev";
import { config } from "../config.js";

export const alpactoAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function buyerRole() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function createOrder(uint256 orderId, address buyer, address association, bytes32 pricingPolicyHash, uint256 budgetUsdcUnits, uint64 targetWeightGrams)",
  "function fundOrder(uint256 orderId, uint256 amount, bytes32 paymentReferenceHash)",
  "function withdrawRemainder(uint256 orderId)",
  "function getOrder(uint256 orderId) view returns (address, address, bytes32, uint256, uint256, uint256, uint8, bool, uint64, uint64, uint64)",
]);
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

function normalizePrivateKey(key: string): Hex {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

/** Fits PostgreSQL signed bigint and uint256 onchain order ids. */
export function deriveOnchainOrderId(orderUuid: string): bigint {
  const hash = keccak256(toBytes(orderUuid));
  const maxPgBigInt = (1n << 63n) - 1n;
  return BigInt(hash) % maxPgBigInt;
}

export function paymentReferenceHashFromStripeId(stripeId: string): Hex {
  return keccak256(toBytes(stripeId));
}

export function getTreasuryClients() {
  const core = config.chain.alpactoContract as Address;
  const usdc = config.chain.usdcToken as Address;
  if (!core) throw new Error("ALPACTO_CONTRACT_ADDRESS is not configured");
  if (!config.chain.treasuryPrivateKey) {
    throw new Error("TREASURY_PRIVATE_KEY is not configured");
  }

  const account = privateKeyToAccount(normalizePrivateKey(config.chain.treasuryPrivateKey));
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: createPublicRpcTransport(config.chain.rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: createPublicRpcTransport(config.chain.rpcUrl),
  });

  return { core, usdc, account, publicClient, walletClient };
}

export async function orderExistsOnchain(onchainOrderId: bigint): Promise<boolean> {
  const { core, publicClient } = getTreasuryClients();
  const result = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "getOrder",
    args: [onchainOrderId],
  });
  return result[7];
}

export async function ensureBuyerRoleForTreasury(): Promise<void> {
  const { core, account, publicClient, walletClient } = getTreasuryClients();
  const buyerRole = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "buyerRole",
  });
  const hasRole = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "hasRole",
    args: [buyerRole, account.address],
  });
  if (hasRole) return;

  const hash = await walletClient.writeContract({
    address: core,
    abi: alpactoAbi,
    functionName: "grantRole",
    args: [buyerRole, account.address],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function ensureOrderOnchain(opts: {
  onchainOrderId: bigint;
  buyerAddress: Address;
  associationAddress: Address;
  pricingPolicyHash: Hex;
  budgetUsdcUnits: bigint;
  targetWeightGrams: bigint;
}): Promise<void> {
  if (await orderExistsOnchain(opts.onchainOrderId)) return;

  const { core, walletClient, publicClient, account } = getTreasuryClients();
  await ensureBuyerRoleForTreasury();

  // createOrder requires msg.sender == buyer; treasury acts as demo buyer.
  const hash = await walletClient.writeContract({
    address: core,
    abi: alpactoAbi,
    functionName: "createOrder",
    args: [
      opts.onchainOrderId,
      account.address,
      opts.associationAddress,
      opts.pricingPolicyHash,
      opts.budgetUsdcUnits,
      opts.targetWeightGrams,
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function fundOrderOnchain(opts: {
  onchainOrderId: bigint;
  amount: bigint;
  paymentReferenceHash: Hex;
}): Promise<Hex> {
  const { core, usdc, walletClient, publicClient, account } = getTreasuryClients();

  const allowance = await publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, core],
  });

  if (allowance < opts.amount) {
    const approveHash = await walletClient.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [core, opts.amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const fundHash = await walletClient.writeContract({
    address: core,
    abi: alpactoAbi,
    functionName: "fundOrder",
    args: [opts.onchainOrderId, opts.amount, opts.paymentReferenceHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash });
  return fundHash;
}

export async function readOrderEscrow(onchainOrderId: bigint) {
  const { core, publicClient } = getTreasuryClients();
  const result = await publicClient.readContract({
    address: core,
    abi: alpactoAbi,
    functionName: "getOrder",
    args: [onchainOrderId],
  });
  return {
    buyer: result[0],
    association: result[1],
    pricingPolicyHash: result[2],
    budgetUsdc: result[3],
    fundedUsdc: result[4],
    remainingUsdc: result[5],
    status: result[6],
    exists: result[7],
    targetWeightGrams: result[8],
    reservedWeightGrams: result[9],
    fulfilledWeightGrams: result[10],
  };
}
