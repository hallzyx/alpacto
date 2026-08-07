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
import {
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  deriveDemoOwnerKey,
  loadZeroDevConfigFromEnv,
  trySponsoredThenSelfFunded,
  trySponsoredThenSelfFundedBatch,
} from "@alpacto/zero-dev";
import { config } from "../config.js";
import { alpactoAbi, erc20Abi, getTreasuryClients, orderExistsOnchain } from "./treasury.js";

const BUYER_FUND_ABI = parseAbi([
  "function createOrder(uint256 orderId, address buyer, address association, bytes32 pricingPolicyHash, uint256 budgetUsdcUnits, uint64 targetWeightGrams)",
  "function buyerFundOrder(uint256 orderId, uint256 amount, bytes32 paymentReferenceHash)",
  "function withdrawRemainder(uint256 orderId)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

function normalizePrivateKey(key: string): Hex {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

function resolveBuyerOwnerKey(buyerEmail: string): Hex {
  const masterSeed =
    process.env["DEMO_WALLET_SEED"]?.trim() || "alpacto-local-demo-wallet-seed-v1";
  return deriveDemoOwnerKey(masterSeed, buyerEmail);
}

async function fundEthFromTreasury(to: Address): Promise<void> {
  if (!config.chain.treasuryPrivateKey) {
    throw new Error("TREASURY_PRIVATE_KEY required to top-up buyer SA gas");
  }
  const { publicClient } = getTreasuryClients();
  const bal = await publicClient.getBalance({ address: to });
  if (bal >= 10n ** 15n) return;

  const account = privateKeyToAccount(normalizePrivateKey(config.chain.treasuryPrivateKey));
  const wallet = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(config.chain.rpcUrl),
  });
  const hash = await wallet.sendTransaction({
    to,
    value: 10n ** 16n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Create order on-chain with the buyer's Kernel as buyer, then fund escrow
 * from the buyer's USDC via buyerFundOrder (UserOp).
 */
export async function ensureAndFundOrderAsBuyer(opts: {
  onchainOrderId: bigint;
  buyerAddress: Address;
  buyerEmail: string;
  associationAddress: Address;
  pricingPolicyHash: Hex;
  budgetUsdcUnits: bigint;
  targetWeightGrams: bigint;
  amount: bigint;
  paymentReferenceHash: Hex;
  onLog: (msg: string) => void;
}): Promise<Hex> {
  const core = config.chain.alpactoContract as Address;
  const usdc = config.chain.usdcToken as Address;
  if (!core) throw new Error("ALPACTO_CONTRACT_ADDRESS is not configured");
  if (opts.targetWeightGrams <= 0n) {
    throw new Error("targetWeightGrams must be > 0 for on-chain createOrder");
  }

  const zd = loadZeroDevConfigFromEnv();
  const publicClient = createAlpactoPublicClient({
    ...zd,
    publicRpc: config.chain.rpcUrl,
  });
  const ownerKey = resolveBuyerOwnerKey(opts.buyerEmail);
  const buyerAccount = await createEcdsaKernelAccount(publicClient, ownerKey);

  if (buyerAccount.address.toLowerCase() !== opts.buyerAddress.toLowerCase()) {
    throw new Error(
      `Buyer Kernel mismatch: derived ${buyerAccount.address} vs order ${opts.buyerAddress}. ` +
        `Re-run yarn seed:wallets with the same DEMO_WALLET_SEED.`,
    );
  }

  const exists = await orderExistsOnchain(opts.onchainOrderId);
  if (!exists) {
    opts.onLog(`buyer createOrder orderId=${opts.onchainOrderId.toString()}`);
    await trySponsoredThenSelfFunded({
      publicClient,
      account: buyerAccount,
      config: zd,
      fundEth: fundEthFromTreasury,
      to: core,
      abi: BUYER_FUND_ABI,
      functionName: "createOrder",
      args: [
        opts.onchainOrderId,
        buyerAccount.address,
        opts.associationAddress,
        opts.pricingPolicyHash,
        opts.budgetUsdcUnits,
        opts.targetWeightGrams,
      ],
    });
  }

  const readClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(config.chain.rpcUrl),
  });
  const buyerUsdc = await readClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [buyerAccount.address],
  });
  if (buyerUsdc < opts.amount) {
    throw new Error(
      `Buyer SA ${buyerAccount.address} has ${buyerUsdc} USDC units; need ${opts.amount}. ` +
        `Run: yarn fund-demo-buyer -- --amount ${Number(opts.amount) / 1e6}`,
    );
  }

  opts.onLog(
    `buyerFundOrder amount=${opts.amount.toString()} from=${buyerAccount.address}`,
  );
  const { receipt } = await trySponsoredThenSelfFundedBatch({
    publicClient,
    account: buyerAccount,
    config: zd,
    fundEth: fundEthFromTreasury,
    calls: [
      {
        to: usdc,
        abi: BUYER_FUND_ABI,
        functionName: "approve",
        args: [core, opts.amount],
      },
      {
        to: core,
        abi: BUYER_FUND_ABI,
        functionName: "buyerFundOrder",
        args: [opts.onchainOrderId, opts.amount, opts.paymentReferenceHash],
      },
    ],
  });

  const txHash = receipt.receipt.transactionHash as Hex;
  return txHash;
}

/**
 * Buyer Kernel calls withdrawRemainder — returns leftover escrow USDC to the buyer.
 * Requires fulfilled >= target, reserved == 0, remaining > 0 on-chain.
 */
export async function withdrawRemainderAsBuyer(opts: {
  onchainOrderId: bigint;
  buyerAddress: Address;
  buyerEmail: string;
  onLog: (msg: string) => void;
}): Promise<Hex> {
  const core = config.chain.alpactoContract as Address;
  if (!core) throw new Error("ALPACTO_CONTRACT_ADDRESS is not configured");

  const zd = loadZeroDevConfigFromEnv();
  const publicClient = createAlpactoPublicClient({
    ...zd,
    publicRpc: config.chain.rpcUrl,
  });
  const ownerKey = resolveBuyerOwnerKey(opts.buyerEmail);
  const buyerAccount = await createEcdsaKernelAccount(publicClient, ownerKey);

  if (buyerAccount.address.toLowerCase() !== opts.buyerAddress.toLowerCase()) {
    throw new Error(
      `Buyer Kernel mismatch: derived ${buyerAccount.address} vs order ${opts.buyerAddress}. ` +
        `Re-run yarn seed:wallets with the same DEMO_WALLET_SEED.`,
    );
  }

  opts.onLog(`buyer withdrawRemainder orderId=${opts.onchainOrderId.toString()}`);
  const { receipt } = await trySponsoredThenSelfFunded({
    publicClient,
    account: buyerAccount,
    config: zd,
    fundEth: fundEthFromTreasury,
    to: core,
    abi: BUYER_FUND_ABI,
    functionName: "withdrawRemainder",
    args: [opts.onchainOrderId],
  });

  return receipt.receipt.transactionHash as Hex;
}
