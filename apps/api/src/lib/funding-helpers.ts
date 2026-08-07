import { eq } from "drizzle-orm";
import {
  campaigns,
  orders,
  organizationMembers,
  pricingPolicies,
  users,
  type Database,
} from "@alpacto/database";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { config } from "../config.js";
import { deriveOnchainOrderId } from "./treasury.js";

function treasuryFallbackAddress(): string {
  const key = config.chain.treasuryPrivateKey.trim();
  if (!key) return "";
  const normalized = (key.startsWith("0x") ? key : `0x${key}`) as Hex;
  return privateKeyToAccount(normalized).address;
}

/** Org may also list producers — pick the association (or admin) account, not .limit(1). */
export async function resolveAssociationUser(
  db: Database,
  organizationId: string,
): Promise<typeof users.$inferSelect | undefined> {
  const rows = await db
    .select({ user: users })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId));

  return (
    rows.find((r) => r.user.role === "association")?.user ??
    rows.find((r) => r.user.role === "admin")?.user ??
    rows[0]?.user
  );
}

export async function resolveOrderAddresses(
  db: Database,
  order: typeof orders.$inferSelect,
): Promise<{ buyerAddress: string; associationAddress: string; policyHash: string }> {
  const [buyer] = await db
    .select()
    .from(users)
    .where(eq(users.id, order.buyerId))
    .limit(1);

  const associationUser = await resolveAssociationUser(db, order.associationId);

  const fallback = treasuryFallbackAddress();
  const buyerAddress =
    buyer?.smartAccountAddress ||
    config.chain.demoBuyerAddress ||
    fallback;
  const associationAddress =
    associationUser?.smartAccountAddress ||
    config.chain.demoAssociationAddress ||
    fallback;

  if (!buyerAddress || !associationAddress) {
    throw new Error(
      "Buyer/association smart account addresses missing — set user.smartAccountAddress or DEMO_* env",
    );
  }

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId))
    .limit(1);
  if (!campaign) throw new Error("Campaign not found");

  const [policy] = await db
    .select()
    .from(pricingPolicies)
    .where(eq(pricingPolicies.id, campaign.pricingPolicyId))
    .limit(1);
  if (!policy) throw new Error("Pricing policy not found");

  return {
    buyerAddress,
    associationAddress,
    policyHash: policy.policyHash,
  };
}

export async function assignOnchainOrderId(
  db: Database,
  order: typeof orders.$inferSelect,
): Promise<bigint> {
  if (order.onchainOrderId != null) return order.onchainOrderId;
  const onchainOrderId = deriveOnchainOrderId(order.id);
  await db
    .update(orders)
    .set({ onchainOrderId, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  return onchainOrderId;
}
