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
