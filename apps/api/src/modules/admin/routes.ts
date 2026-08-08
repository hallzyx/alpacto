import type { FastifyInstance } from "fastify";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import {
  auditRuns,
  fundingIntents,
  inspections,
  lots,
  orders,
  reweighRequests,
  settlements,
  users,
  type Database,
} from "@alpacto/database";
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import { arbitrumSepolia } from "viem/chains";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { config } from "../../config.js";

const erc20BalanceAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

function explorerAddressUrl(chainId: number, address: string): string {
  if (chainId === 421614) return `https://sepolia.arbiscan.io/address/${address}`;
  if (chainId === 42161) return `https://arbiscan.io/address/${address}`;
  return `https://sepolia.arbiscan.io/address/${address}`;
}

/** Soft label for jury demos — not a hard security claim. */
function walletOriginHint(email: string, smartAccount: string | null): "demo_seed" | "live" | "none" {
  if (!smartAccount) return "none";
  if (email.trim().toLowerCase().endsWith("@demo.alpacto")) return "demo_seed";
  return "live";
}

async function readUsdcBalances(
  addresses: Address[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const token = (config.chain.usdcToken || "").trim() as Address;
  const rpc = config.chain.rpcUrl;
  if (!token || !rpc || addresses.length === 0) {
    for (const a of addresses) out.set(a.toLowerCase(), null);
    return out;
  }

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpc),
  });

  const chunkSize = 12;
  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize);
    const results = await Promise.allSettled(
      chunk.map((address) =>
        publicClient.readContract({
          address: token,
          abi: erc20BalanceAbi,
          functionName: "balanceOf",
          args: [address],
        }),
      ),
    );
    results.forEach((result, idx) => {
      const key = chunk[idx]!.toLowerCase();
      if (result.status === "fulfilled") {
        out.set(key, result.value.toString());
      } else {
        out.set(key, null);
      }
    });
  }
  return out;
}

export type OnchainActivityType =
  | "order_funded"
  | "lot_registered"
  | "inspection"
  | "audit_attest"
  | "settlement"
  | "reweigh"
  | "remainder_withdraw";

function explorerTxUrl(chainId: number, txHash: string): string {
  if (chainId === 421614) return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (chainId === 42161) return `https://arbiscan.io/tx/${txHash}`;
  return `https://sepolia.arbiscan.io/tx/${txHash}`;
}

function pushActivity(
  list: Array<{
    id: string;
    type: OnchainActivityType;
    txHash: string;
    at: string;
    orderRef: string | null;
    orderId: string | null;
    lotId: string | null;
    detail: string | null;
    amountUsdcUnits: string | null;
    explorerUrl: string;
  }>,
  seen: Set<string>,
  item: Omit<(typeof list)[number], "explorerUrl">,
) {
  const key = `${item.type}:${item.txHash}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    ...item,
    explorerUrl: explorerTxUrl(config.chain.chainId, item.txHash),
  });
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/admin/users", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }

    const rows = await db.select().from(users).orderBy(asc(users.role), asc(users.email));

    const addresses = rows
      .map((r) => r.smartAccountAddress)
      .filter((a): a is string => Boolean(a && a.startsWith("0x") && a.length === 42))
      .map((a) => a as Address);

    const uniqueAddresses = [...new Map(addresses.map((a) => [a.toLowerCase(), a])).values()];
    const balances = await readUsdcBalances(uniqueAddresses);

    return {
      chainId: config.chain.chainId,
      usdcToken: config.chain.usdcToken || null,
      explorerName: config.chain.chainId === 421614 ? "Arbiscan Sepolia" : "Arbiscan",
      users: rows.map((row) => {
        const address = row.smartAccountAddress;
        const balanceKey = address?.toLowerCase() ?? "";
        const usdcUnits = address ? (balances.get(balanceKey) ?? null) : null;
        return {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          status: row.status,
          smartAccountAddress: address,
          walletOrigin: walletOriginHint(row.email, address),
          usdcUnits,
          explorerUrl: address ? explorerAddressUrl(config.chain.chainId, address) : null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    };
  });

  app.get("/admin/onchain-activity", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }

    const activities: Array<{
      id: string;
      type: OnchainActivityType;
      txHash: string;
      at: string;
      orderRef: string | null;
      orderId: string | null;
      lotId: string | null;
      detail: string | null;
      amountUsdcUnits: string | null;
      explorerUrl: string;
    }> = [];
    const seen = new Set<string>();

    const orderRows = await db
      .select()
      .from(orders)
      .where(isNotNull(orders.txHash))
      .orderBy(desc(orders.updatedAt));

    for (const row of orderRows) {
      if (!row.txHash) continue;
      pushActivity(activities, seen, {
        id: `order-${row.id}`,
        type: "order_funded",
        txHash: row.txHash,
        at: row.updatedAt.toISOString(),
        orderRef: row.externalRef,
        orderId: row.id,
        lotId: null,
        detail: "Fondeo de orden en escrow on-chain",
        amountUsdcUnits: row.fundedUsdcUnits > 0n ? row.fundedUsdcUnits.toString() : null,
      });
    }

    const intentRows = await db
      .select()
      .from(fundingIntents)
      .where(isNotNull(fundingIntents.fundingTxHash))
      .orderBy(desc(fundingIntents.createdAt));

    for (const row of intentRows) {
      if (!row.fundingTxHash) continue;
      const [order] = await db.select().from(orders).where(eq(orders.id, row.orderId)).limit(1);
      pushActivity(activities, seen, {
        id: `funding-intent-${row.id}`,
        type: "order_funded",
        txHash: row.fundingTxHash,
        at: row.createdAt.toISOString(),
        orderRef: order?.externalRef ?? null,
        orderId: row.orderId,
        lotId: null,
        detail: "Intent de fondeo Stripe → on-chain",
        amountUsdcUnits: row.usdcUnits.toString(),
      });
    }

    const remainderRows = await db
      .select()
      .from(orders)
      .where(isNotNull(orders.remainderWithdrawTxHash))
      .orderBy(desc(orders.updatedAt));

    for (const row of remainderRows) {
      if (!row.remainderWithdrawTxHash) continue;
      const amount =
        row.remainderWithdrawnUsdcUnits != null && row.remainderWithdrawnUsdcUnits > 0n
          ? row.remainderWithdrawnUsdcUnits.toString()
          : null;
      pushActivity(activities, seen, {
        id: `remainder-${row.id}`,
        type: "remainder_withdraw",
        txHash: row.remainderWithdrawTxHash,
        at: row.updatedAt.toISOString(),
        orderRef: row.externalRef,
        orderId: row.id,
        lotId: null,
        detail: "Retiro de remanente de la cuenta de garantía → comprador",
        amountUsdcUnits: amount,
      });
    }

    const lotRegisterRows = await db
      .select({
        lot: lots,
        order: orders,
      })
      .from(lots)
      .innerJoin(orders, eq(lots.orderId, orders.id))
      .where(isNotNull(lots.registerTxHash))
      .orderBy(desc(lots.createdAt));

    for (const { lot, order } of lotRegisterRows) {
      if (!lot.registerTxHash) continue;
      pushActivity(activities, seen, {
        id: `lot-register-${lot.id}`,
        type: "lot_registered",
        txHash: lot.registerTxHash,
        at: lot.createdAt.toISOString(),
        orderRef: order.externalRef,
        orderId: order.id,
        lotId: lot.id,
        detail: lot.onchainLotId
          ? `Registro de lote on-chain · id ${lot.onchainLotId.toString()}`
          : "Registro de lote on-chain",
        amountUsdcUnits: null,
      });
    }

    const inspectionRows = await db
      .select({
        inspection: inspections,
        lot: lots,
        order: orders,
      })
      .from(inspections)
      .innerJoin(lots, eq(inspections.lotId, lots.id))
      .innerJoin(orders, eq(lots.orderId, orders.id))
      .where(isNotNull(inspections.onchainTxHash))
      .orderBy(desc(inspections.submittedAt));

    for (const { inspection, lot, order } of inspectionRows) {
      if (!inspection.onchainTxHash) continue;
      pushActivity(activities, seen, {
        id: `inspection-${inspection.id}`,
        type: "inspection",
        txHash: inspection.onchainTxHash,
        at: inspection.submittedAt.toISOString(),
        orderRef: order.externalRef,
        orderId: order.id,
        lotId: lot.id,
        detail: `Inspección v${inspection.version} · ${inspection.categoryCode}`,
        amountUsdcUnits: null,
      });
    }

    const auditRows = await db
      .select({
        audit: auditRuns,
        lot: lots,
        order: orders,
      })
      .from(auditRuns)
      .innerJoin(lots, eq(auditRuns.lotId, lots.id))
      .innerJoin(orders, eq(lots.orderId, orders.id))
      .where(isNotNull(auditRuns.onchainTxHash))
      .orderBy(desc(auditRuns.completedAt));

    for (const { audit, lot, order } of auditRows) {
      if (!audit.onchainTxHash || !audit.completedAt) continue;
      pushActivity(activities, seen, {
        id: `audit-${audit.id}`,
        type: "audit_attest",
        txHash: audit.onchainTxHash,
        at: audit.completedAt.toISOString(),
        orderRef: order.externalRef,
        orderId: order.id,
        lotId: lot.id,
        detail: `Ayni attest · ${audit.resultCode ?? audit.status}`,
        amountUsdcUnits: null,
      });
    }

    const settlementRows = await db
      .select({
        settlement: settlements,
        lot: lots,
        order: orders,
      })
      .from(settlements)
      .innerJoin(lots, eq(settlements.lotId, lots.id))
      .innerJoin(orders, eq(lots.orderId, orders.id))
      .where(isNotNull(settlements.settlementTxHash))
      .orderBy(desc(settlements.settledAt));

    for (const { settlement, lot, order } of settlementRows) {
      if (!settlement.settlementTxHash) continue;
      const at = settlement.settledAt ?? settlement.acceptedAt ?? new Date();
      const totalUsdc =
        settlement.producerUsdcUnits +
        settlement.associationUsdcUnits +
        (settlement.platformUsdcUnits ?? 0n);
      pushActivity(activities, seen, {
        id: `settlement-${settlement.id}`,
        type: "settlement",
        txHash: settlement.settlementTxHash,
        at: at.toISOString(),
        orderRef: order.externalRef,
        orderId: order.id,
        lotId: lot.id,
        detail: `Liquidación lote · ${settlement.categoryCode}`,
        amountUsdcUnits: totalUsdc.toString(),
      });
    }

    const reweighRows = await db
      .select({
        reweigh: reweighRequests,
        lot: lots,
        order: orders,
      })
      .from(reweighRequests)
      .innerJoin(lots, eq(reweighRequests.lotId, lots.id))
      .innerJoin(orders, eq(lots.orderId, orders.id))
      .where(isNotNull(reweighRequests.onchainTxHash))
      .orderBy(desc(reweighRequests.createdAt));

    for (const { reweigh, lot, order } of reweighRows) {
      if (!reweigh.onchainTxHash) continue;
      pushActivity(activities, seen, {
        id: `reweigh-${reweigh.id}`,
        type: "reweigh",
        txHash: reweigh.onchainTxHash,
        at: reweigh.createdAt.toISOString(),
        orderRef: order.externalRef,
        orderId: order.id,
        lotId: lot.id,
        detail: `Solicitud re-pesaje · ${reweigh.reasonCode}`,
        amountUsdcUnits: null,
      });
    }

    activities.sort((a, b) => (a.at < b.at ? 1 : -1));

    return {
      chainId: config.chain.chainId,
      explorerName: config.chain.chainId === 421614 ? "Arbiscan Sepolia" : "Arbiscan",
      activities,
    };
  });
}
