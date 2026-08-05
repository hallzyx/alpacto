import { and, desc, eq } from "drizzle-orm";
import {
  campaigns,
  lots,
  orders,
  organizations,
  pricingCategories,
  pricingPolicies,
  type Database,
} from "@alpacto/database";

const FUNDED_ORDER_STATUSES = new Set([
  "funded",
  "accepting_lots",
  "partially_settled",
  "closed",
]);

export type ProducerLotRow = {
  id: string;
  onchainLotId: string | null;
  orderId: string;
  producerId: string;
  status: string;
  currentInspectionVersion: number;
  acceptedInspectionVersion: number | null;
  producerConfirmedAt: string | null;
  producerDeclinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function serializeLotRow(row: typeof lots.$inferSelect): ProducerLotRow {
  return {
    id: row.id,
    onchainLotId: row.onchainLotId?.toString() ?? null,
    orderId: row.orderId,
    producerId: row.producerId,
    status: row.status,
    currentInspectionVersion: row.currentInspectionVersion,
    acceptedInspectionVersion: row.acceptedInspectionVersion,
    producerConfirmedAt: row.producerConfirmedAt?.toISOString() ?? null,
    producerDeclinedAt: row.producerDeclinedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadPricingSummary(db: Database, pricingPolicyId: string) {
  const [policy] = await db
    .select()
    .from(pricingPolicies)
    .where(eq(pricingPolicies.id, pricingPolicyId))
    .limit(1);
  if (!policy) return null;
  const categories = await db
    .select()
    .from(pricingCategories)
    .where(eq(pricingCategories.pricingPolicyId, pricingPolicyId));
  return {
    currency: policy.currency,
    associationFeeBps: policy.associationFeeBps,
    categories: categories.map((c) => ({
      code: c.code,
      label: c.label,
      pricePenMinorPerKg: c.pricePenMinorPerKg.toString(),
      qualityBonusPenMinorPerKg: c.qualityBonusPenMinorPerKg.toString(),
    })),
  };
}

export type ProducerOrderParticipation = {
  orderId: string;
  externalRef: string | null;
  orderStatus: string;
  fundsSecured: boolean;
  campaign: {
    id: string;
    name: string;
    status: string;
    associationName: string | null;
    startDate: string | null;
    endDate: string | null;
    pricing: Awaited<ReturnType<typeof loadPricingSummary>>;
  };
  lotCount: number;
  lots: ProducerLotRow[];
};

export async function buildProducerOrderParticipation(
  db: Database,
  producerId: string,
  orderId: string,
  producerLots: typeof lots.$inferSelect[],
): Promise<ProducerOrderParticipation | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId))
    .limit(1);
  if (!campaign) return null;

  const [[org], pricing] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, campaign.organizationId)).limit(1),
    loadPricingSummary(db, campaign.pricingPolicyId),
  ]);

  return {
    orderId: order.id,
    externalRef: order.externalRef,
    orderStatus: order.status,
    fundsSecured: FUNDED_ORDER_STATUSES.has(order.status),
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      associationName: org?.name ?? null,
      startDate: campaign.startDate?.toISOString() ?? null,
      endDate: campaign.endDate?.toISOString() ?? null,
      pricing,
    },
    lotCount: producerLots.length,
    lots: producerLots.map(serializeLotRow),
  };
}

export async function loadProducerParticipation(db: Database, producerId: string) {
  const lotRows = await db
    .select()
    .from(lots)
    .where(eq(lots.producerId, producerId))
    .orderBy(desc(lots.updatedAt));

  const byOrder = new Map<string, typeof lots.$inferSelect[]>();
  for (const lot of lotRows) {
    const group = byOrder.get(lot.orderId) ?? [];
    group.push(lot);
    byOrder.set(lot.orderId, group);
  }

  const orderParticipations: ProducerOrderParticipation[] = [];
  for (const [orderId, orderLots] of byOrder) {
    const participation = await buildProducerOrderParticipation(db, producerId, orderId, orderLots);
    if (participation) orderParticipations.push(participation);
  }

  orderParticipations.sort((a, b) => {
    const aLatest = a.lots[a.lots.length - 1]?.updatedAt ?? "";
    const bLatest = b.lots[b.lots.length - 1]?.updatedAt ?? "";
    return bLatest.localeCompare(aLatest);
  });

  return {
    orders: orderParticipations,
    totalLots: lotRows.length,
  };
}

export async function loadProducerLotContext(
  db: Database,
  producerId: string,
  lotId: string,
): Promise<ProducerOrderParticipation | null> {
  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  if (!lot || lot.producerId !== producerId) return null;

  const orderLots = await db
    .select()
    .from(lots)
    .where(and(eq(lots.producerId, producerId), eq(lots.orderId, lot.orderId)));

  return buildProducerOrderParticipation(db, producerId, lot.orderId, orderLots);
}
