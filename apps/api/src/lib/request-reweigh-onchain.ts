import { eq } from "drizzle-orm";
import { lots, reweighRequests, users, type Database } from "@alpacto/database";
import {
  createWalletClient,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { createPublicRpcTransport } from "@alpacto/zero-dev";
import { config } from "../config.js";
import { isChainConfigured, readLotOnchain } from "./onchain-ids.js";
import {
  ProducerSessionRequiredError,
  resolveProducerSigner,
  sendProducerCall,
} from "./producer-signer.js";
import { getTreasuryClients } from "./treasury.js";

const reweighAbi = parseAbi([
  "function requestReweighing(uint256 lotId, bytes32 reasonHash)",
]);

/** On-chain statuses that allow requestReweighing (must match AlpactoCore lot_status). */
const ONCHAIN_READY_FOR_REVIEW = 3;
const ONCHAIN_REVIEW_REQUIRED = 4;

function normalizePrivateKey(key: string): Hex {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
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
    transport: createPublicRpcTransport(config.chain.rpcUrl),
  });
  const hash = await wallet.sendTransaction({ to, value: 10n ** 16n });
  await publicClient.waitForTransactionReceipt({ hash });
}

export function reweighReasonHash(reasonCode: string, reasonText?: string | null): Hex {
  return keccak256(toBytes(`reweigh:${reasonCode}:${reasonText ?? ""}`));
}

/**
 * Producer Kernel (seed or Google session key) calls requestReweighing.
 */
export async function ensureReweighOnchain(
  db: Database,
  reweighRequestId: string,
  onLog: (msg: string) => void = () => {},
): Promise<{ txHash: Hex }> {
  if (!isChainConfigured()) {
    throw new Error("ALPACTO_CONTRACT_ADDRESS is not configured");
  }

  const [reweigh] = await db
    .select()
    .from(reweighRequests)
    .where(eq(reweighRequests.id, reweighRequestId))
    .limit(1);
  if (!reweigh) throw new Error("Reweigh request not found");
  if (reweigh.onchainTxHash) {
    return { txHash: reweigh.onchainTxHash as Hex };
  }

  const [lot] = await db.select().from(lots).where(eq(lots.id, reweigh.lotId)).limit(1);
  if (!lot?.onchainLotId) {
    throw new Error("Lot has no onchain_lot_id — register the lot on-chain first");
  }

  const chainLot = await readLotOnchain(lot.onchainLotId);
  if (!chainLot.exists) {
    throw new Error("Lot missing on-chain");
  }
  if (
    chainLot.status !== ONCHAIN_READY_FOR_REVIEW &&
    chainLot.status !== ONCHAIN_REVIEW_REQUIRED
  ) {
    // 2 = AUDITING: inspection is on-chain but Ayni has not attested yet.
    if (chainLot.status === 2) {
      throw new Error(
        "Ayni aún no terminó de registrar su veredicto. Espera a que la revisión quede lista (aprobado o requiere revisión) y luego pide el nuevo pesaje.",
      );
    }
    throw new Error(
      "El lote aún no está listo para un nuevo pesaje. Espera a que Ayni termine su revisión (estado listo para liquidar o revisión requerida).",
    );
  }

  const [producer] = await db.select().from(users).where(eq(users.id, lot.producerId)).limit(1);
  if (!producer?.smartAccountAddress || !producer.email) {
    throw new Error("Producer smart account / email missing for reweigh");
  }

  const core = config.chain.alpactoContract as Address;
  const reasonHash = reweighReasonHash(reweigh.reasonCode, reweigh.reasonText);

  onLog(`requestReweighing lot=${lot.onchainLotId.toString()} reason=${reweigh.reasonCode}`);
  const signer = await resolveProducerSigner(db, {
    id: producer.id,
    email: producer.email,
    smartAccountAddress: producer.smartAccountAddress,
  });
  onLog(`producer signer kind=${signer.kind}`);

  const { receipt } = await sendProducerCall({
    signer,
    fundEth: fundEthFromTreasury,
    to: core,
    abi: reweighAbi,
    functionName: "requestReweighing",
    args: [lot.onchainLotId, reasonHash],
  });

  const txHash = receipt.receipt.transactionHash as Hex;
  await db
    .update(reweighRequests)
    .set({ onchainTxHash: txHash })
    .where(eq(reweighRequests.id, reweigh.id));

  onLog(`requestReweighing tx=${txHash}`);
  return { txHash };
}

export { ProducerSessionRequiredError };
