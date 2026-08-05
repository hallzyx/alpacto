import { desc, eq } from "drizzle-orm";
import { lots, settlements, users, type Database } from "@alpacto/database";
import { ApiError } from "./errors.js";
import {
  isChainConfigured,
  ONCHAIN_LOT_STATUS,
  readLotOnchain,
} from "./onchain-ids.js";

export type IntegrityDiff = {
  field: string;
  postgres: string;
  onchain: string;
};

export type IntegrityResult = {
  lotId: string;
  match: boolean;
  severity: "ok" | "warning" | "critical" | "info";
  mode: "matched" | "demo_local_payout" | "chain_unavailable" | "not_settled_yet" | "mismatch";
  message: string;
  diffs: IntegrityDiff[];
  postgres: Record<string, string | null>;
  onchain: Record<string, string | null> | null;
};

function normalizeHash(h: string | null | undefined): string {
  return (h ?? "").toLowerCase();
}

function expectedOnchainStatus(lotStatus: string, settlementStatus: string | null): number | null {
  if (lotStatus === "settled" || settlementStatus === "settled") return ONCHAIN_LOT_STATUS.Settled;
  if (lotStatus === "settlement_accepted" || settlementStatus === "accepted") {
    return ONCHAIN_LOT_STATUS.ProducerAccepted;
  }
  return null;
}

export async function verifyLotIntegrity(
  db: Database,
  producerId: string,
  lotId: string,
): Promise<IntegrityResult> {
  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  if (!lot || lot.producerId !== producerId) {
    throw new ApiError(404, "Lot not found");
  }

  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.lotId, lotId))
    .orderBy(desc(settlements.acceptedAt))
    .limit(1);

  const postgres = {
    lotStatus: lot.status,
    onchainLotId: lot.onchainLotId?.toString() ?? null,
    acceptedInspectionVersion: lot.acceptedInspectionVersion?.toString() ?? null,
    settlementStatus: settlement?.status ?? null,
    quoteHash: settlement?.quoteHash ?? null,
    netPenMinor: settlement?.netPenMinor?.toString() ?? null,
    producerUsdcUnits: settlement?.producerUsdcUnits?.toString() ?? null,
    associationUsdcUnits: settlement?.associationUsdcUnits?.toString() ?? null,
    platformUsdcUnits: settlement?.platformUsdcUnits?.toString() ?? null,
    settlementTxHash: settlement?.settlementTxHash ?? null,
  };

  if (!settlement) {
    return {
      lotId,
      match: true,
      severity: "info",
      mode: "not_settled_yet",
      message: "Este lote aún no tiene liquidación registrada en Alpacto. No hay nada que cruzar con la cadena.",
      diffs: [],
      postgres,
      onchain: null,
    };
  }

  const isLocalDemo =
    settlement.status === "settled" &&
    (!settlement.settlementTxHash || settlement.settlementTxHash.startsWith("local-"));

  if (isLocalDemo || !isChainConfigured()) {
    return {
      lotId,
      match: true,
      severity: "info",
      mode: isLocalDemo ? "demo_local_payout" : "chain_unavailable",
      message: isLocalDemo
        ? "Esta liquidación es un pago local de demo (sin cadena). No se puede verificar on-chain."
        : "La cadena no está configurada en este entorno. Solo se muestra la data de Alpacto (Postgres).",
      diffs: [],
      postgres,
      onchain: null,
    };
  }

  if (lot.onchainLotId == null) {
    return {
      lotId,
      match: false,
      severity: "critical",
      mode: "mismatch",
      message:
        "URGENTE: el lote figura liquidado/aceptado en Alpacto pero no tiene ID on-chain. Puede haber inconsistencia.",
      diffs: [
        {
          field: "onchainLotId",
          postgres: "null",
          onchain: "missing",
        },
      ],
      postgres,
      onchain: null,
    };
  }

  let chain;
  try {
    chain = await readLotOnchain(lot.onchainLotId);
  } catch {
    return {
      lotId,
      match: false,
      severity: "warning",
      mode: "chain_unavailable",
      message: "No se pudo leer el lote en la cadena ahora. Intenta de nuevo en un momento.",
      diffs: [],
      postgres,
      onchain: null,
    };
  }

  const onchain = {
    exists: String(chain.exists),
    status: String(chain.status),
    acceptedVersion: String(chain.acceptedVersion),
    quoteHash: chain.quoteHash,
    netPenMinor: chain.netPenMinor.toString(),
    producerUsdc: chain.producerUsdc.toString(),
    associationUsdc: chain.associationUsdc.toString(),
    platformUsdc: chain.platformUsdc.toString(),
    producer: chain.producer,
  };

  if (!chain.exists) {
    return {
      lotId,
      match: false,
      severity: "critical",
      mode: "mismatch",
      message: "URGENTE: Alpacto tiene liquidación, pero el lote no existe en la blockchain.",
      diffs: [{ field: "exists", postgres: "true", onchain: "false" }],
      postgres,
      onchain,
    };
  }

  const [producer] = await db.select().from(users).where(eq(users.id, producerId)).limit(1);
  const diffs: IntegrityDiff[] = [];

  if (
    producer?.smartAccountAddress &&
    producer.smartAccountAddress.toLowerCase() !== chain.producer.toLowerCase()
  ) {
    diffs.push({
      field: "producer",
      postgres: producer.smartAccountAddress,
      onchain: chain.producer,
    });
  }

  const expectedStatus = expectedOnchainStatus(lot.status, settlement.status);
  if (expectedStatus != null && chain.status !== expectedStatus) {
    diffs.push({
      field: "status",
      postgres: `${lot.status}/${settlement.status}`,
      onchain: String(chain.status),
    });
  }

  if (
    settlement.inspectionVersion != null &&
    chain.acceptedVersion > 0 &&
    settlement.inspectionVersion !== chain.acceptedVersion
  ) {
    diffs.push({
      field: "acceptedVersion",
      postgres: String(settlement.inspectionVersion),
      onchain: String(chain.acceptedVersion),
    });
  }

  if (
    settlement.quoteHash &&
    normalizeHash(settlement.quoteHash) !== normalizeHash(chain.quoteHash)
  ) {
    diffs.push({
      field: "quoteHash",
      postgres: settlement.quoteHash,
      onchain: chain.quoteHash,
    });
  }

  if (settlement.netPenMinor.toString() !== chain.netPenMinor.toString()) {
    diffs.push({
      field: "netPenMinor",
      postgres: settlement.netPenMinor.toString(),
      onchain: chain.netPenMinor.toString(),
    });
  }

  if (settlement.producerUsdcUnits.toString() !== chain.producerUsdc.toString()) {
    diffs.push({
      field: "producerUsdc",
      postgres: settlement.producerUsdcUnits.toString(),
      onchain: chain.producerUsdc.toString(),
    });
  }

  if (diffs.length > 0) {
    return {
      lotId,
      match: false,
      severity: "critical",
      mode: "mismatch",
      message:
        "URGENTE: la data de Alpacto y la blockchain no coinciden en este lote. Te recomiendo abrir una disputa de integridad ahora.",
      diffs,
      postgres,
      onchain,
    };
  }

  return {
    lotId,
    match: true,
    severity: "ok",
    mode: "matched",
    message: "Postgres y blockchain coinciden en estado, versión, quote y montos de este lote.",
    diffs: [],
    postgres,
    onchain,
  };
}
