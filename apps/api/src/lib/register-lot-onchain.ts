import { eq } from "drizzle-orm";
import { lots, orders, users, type Database } from "@alpacto/database";
import {
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  deriveDemoOwnerKey,
  loadZeroDevConfigFromEnv,
  trySponsoredThenSelfFunded,
} from "@alpacto/zero-dev";
import {
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { config } from "../config.js";
import { resolveAssociationUser } from "./funding-helpers.js";
import { assignOnchainLotId, isChainConfigured, lotExistsOnchain } from "./onchain-ids.js";
import { getTreasuryClients } from "./treasury.js";

const registerLotAbi = parseAbi([
  "function registerLot(uint256 orderId, uint256 lotId, address producerAccount)",
]);

function normalizePrivateKey(key: string): Hex {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

function resolveDemoOwnerKey(email: string): Hex {
  const masterSeed =
    process.env["DEMO_WALLET_SEED"]?.trim() || "alpacto-local-demo-wallet-seed-v1";
  return deriveDemoOwnerKey(masterSeed, email);
}

async function fundEthFromTreasury(to: Address): Promise<void> {
  if (!config.chain.treasuryPrivateKey) {
    throw new Error("TREASURY_PRIVATE_KEY required to top-up Kernel gas");
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
  const hash = await wallet.sendTransaction({ to, value: 10n ** 16n });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function demoKernelForEmail(email: string, expectedAddress: Address) {
  const zd = loadZeroDevConfigFromEnv();
  const publicClient = createAlpactoPublicClient({
    ...zd,
    publicRpc: config.chain.rpcUrl,
  });
  const ownerKey = resolveDemoOwnerKey(email);
  const account = await createEcdsaKernelAccount(publicClient, ownerKey);
  if (account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Kernel mismatch for ${email}: derived ${account.address} vs expected ${expectedAddress}`,
    );
  }
  return { zd, publicClient, account };
}

/**
 * Assign Postgres onchain_lot_id and call AlpactoCore.registerLot when the order
 * is already on-chain. Must run at lot creation so Ayni can attest before settle.
 */
export async function ensureLotRegisteredOnchain(
  db: Database,
  lotId: string,
  onLog: (msg: string) => void = () => {},
): Promise<{ onchainLotId: bigint; alreadyOnchain: boolean; txHash?: Hex }> {
  if (!isChainConfigured()) {
    throw new Error("ALPACTO_CONTRACT_ADDRESS is not configured");
  }

  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  if (!lot) throw new Error("Lot not found");

  const [order] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
  if (!order?.onchainOrderId) {
    throw new Error("Order has no onchain_order_id — fund the order on-chain first");
  }

  const [producer] = await db.select().from(users).where(eq(users.id, lot.producerId)).limit(1);
  if (!producer?.smartAccountAddress) {
    throw new Error("Producer smart account address missing — producer must connect wallet first");
  }

  const onchainLotId = await assignOnchainLotId(db, lot);
  if (await lotExistsOnchain(onchainLotId)) {
    onLog(`lot already on-chain id=${onchainLotId.toString()}`);
    return { onchainLotId, alreadyOnchain: true };
  }

  const associationUser = await resolveAssociationUser(db, order.associationId);
  if (!associationUser?.smartAccountAddress) {
    throw new Error("Association smart account address missing — run yarn seed:wallets");
  }

  const core = config.chain.alpactoContract as Address;

  onLog(`registerLot order=${order.onchainOrderId.toString()} lot=${onchainLotId.toString()}`);
  const { zd, publicClient, account } = await demoKernelForEmail(
    associationUser.email,
    associationUser.smartAccountAddress as Address,
  );
  const { receipt } = await trySponsoredThenSelfFunded({
    publicClient,
    account,
    config: zd,
    fundEth: fundEthFromTreasury,
    to: core,
    abi: registerLotAbi,
    functionName: "registerLot",
    args: [order.onchainOrderId, onchainLotId, producer.smartAccountAddress as Address],
  });

  const txHash = receipt.receipt.transactionHash;
  await db
    .update(lots)
    .set({ registerTxHash: txHash, updatedAt: new Date() })
    .where(eq(lots.id, lot.id));
  onLog(`registerLot tx=${txHash}`);
  return { onchainLotId, alreadyOnchain: false, txHash };
}
