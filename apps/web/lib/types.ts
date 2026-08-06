export type UserRole = "producer" | "inspector" | "buyer" | "association" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  smartAccountAddress?: string | null;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type Lot = {
  id: string;
  onchainLotId: string | null;
  orderId: string;
  producerId: string;
  status: string;
  currentInspectionVersion: number;
  acceptedInspectionVersion: number | null;
  producerConfirmedAt?: string | null;
  producerDeclinedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Inspection = {
  id: string;
  lotId: string;
  version: number;
  inspectorId: string;
  weightGrams: string;
  categoryCode: string;
  evidenceBundleHash: string | null;
  status: string;
  submittedAt: string;
  onchainTxHash: string | null;
};

export type TimelineEvent = {
  type: string;
  at: string;
  label: string;
  meta?: Record<string, string | null>;
};

export type LotTimeline = {
  lot: Lot;
  inspections: Inspection[];
  reweighRequests: Array<{
    id: string;
    reasonCode: string;
    reasonText: string | null;
    createdAt: string;
  }>;
  audits: Array<{
    id: string;
    status: string;
    resultCode: string | null;
    inspectionVersion: number;
    completedAt: string | null;
  }>;
  events: TimelineEvent[];
};

export type SettlementPreview = {
  lotId: string;
  inspectionVersion: number;
  weightGrams: string;
  categoryCode: string;
  grossPenMinor: string;
  bonusPenMinor: string;
  feePenMinor: string;
  platformFeePenMinor?: string;
  netPenMinor: string;
  producerUsdcUnits: string;
  associationUsdcUnits: string;
  platformUsdcUnits?: string;
};

export type Settlement = {
  id: string;
  lotId: string;
  inspectionVersion: number;
  weightGrams: string;
  categoryCode: string;
  grossPenMinor: string;
  bonusPenMinor: string;
  feePenMinor: string;
  platformFeePenMinor?: string;
  netPenMinor: string;
  producerUsdcUnits: string;
  associationUsdcUnits: string;
  platformUsdcUnits?: string;
  quoteHash: string;
  status: string;
  acceptedAt: string | null;
  settledAt: string | null;
  settlementTxHash: string | null;
};

export type Order = {
  id: string;
  externalRef: string | null;
  onchainOrderId: string | null;
  campaignId: string;
  buyerId: string;
  associationId: string;
  budgetUsdCents: string;
  targetWeightGrams?: string | null;
  fundedUsdcUnits: string;
  remainingUsdcUnits: string;
  status: string;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PricingCategory = {
  code: string;
  label: string;
  pricePenMinorPerKg: string;
  qualityBonusPenMinorPerKg: string;
};

export type PricingPolicy = {
  id: string;
  version: number;
  currency: string;
  associationFeeBps: number;
  platformFeeBps?: number;
  weightToleranceBps: number;
  penPerUsdcMicros: string;
  policyHash: string;
  createdBy?: string | null;
  lockedAt?: string | null;
  createdAt?: string;
  categories: PricingCategory[];
};

export type Campaign = {
  id: string;
  organizationId: string;
  buyerId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  pricingPolicyId: string;
  createdAt: string;
  associationName?: string | null;
  associationType?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  pricing?: PricingPolicy | null;
};

export type Organization = {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
};

export type LocalPayout = {
  id: string;
  settlementId: string;
  provider: string;
  isSimulation: boolean;
  amountPenMinor: string;
  status: string;
  reference: string | null;
  createdAt: string;
  label: string;
};

export type LotDispute = {
  id: string;
  lotId: string;
  openedBy: string;
  reasonCode: string;
  reasonText: string | null;
  status: string;
  resolutionAction: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  lotStatus?: string | null;
  orderId?: string | null;
  orderExternalRef?: string | null;
  producerName?: string | null;
  producerEmail?: string | null;
};

export type AuditFinding = {
  id: string;
  code: string;
  severity: string;
  declaredValue: string | null;
  observedValue: string | null;
  explanation: string | null;
};

export type AuditRunDetail = {
  id: string;
  lotId: string;
  inspectionVersion: number;
  status: string;
  progressPhase?: string | null;
  progressLabel?: string | null;
  resultCode: string | null;
  reportHash?: string | null;
  onchainTxHash?: string | null;
  explorerUrl?: string | null;
  findings: AuditFinding[];
};

/** Producer-scoped order + campaign context (no buyer budget / escrow). */
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
    pricing: Pick<PricingPolicy, "currency" | "associationFeeBps" | "categories"> | null;
  };
  lotCount: number;
  lots: Lot[];
};

export type ProducerParticipation = {
  orders: ProducerOrderParticipation[];
  totalLots: number;
};

export type OnchainActivityType = "order_funded" | "inspection" | "audit_attest" | "settlement" | "reweigh";

export type OnchainActivity = {
  id: string;
  type: OnchainActivityType | string;
  txHash: string;
  at: string;
  orderRef: string | null;
  orderId: string | null;
  lotId: string | null;
  detail: string | null;
  amountUsdcUnits: string | null;
  explorerUrl: string;
};

export type OnchainActivityResponse = {
  chainId: number;
  explorerName: string;
  activities: OnchainActivity[];
};
