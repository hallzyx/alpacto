import { eq } from "drizzle-orm";
import { fundingIntents, orders, users, type Database } from "@alpacto/database";
import type { Address, Hex } from "viem";
import {
  assignOnchainOrderId,
  resolveOrderAddresses,
} from "../lib/funding-helpers.js";
import { ensureAndFundOrderAsBuyer } from "../lib/buyer-funding.js";

export async function processFundOrderJob(
  db: Database,
  fundingIntentId: string,
  onLog: (msg: string) => void,
): Promise<{ txHash: string; onchainOrderId: string }> {
  const [intent] = await db
    .select()
    .from(fundingIntents)
    .where(eq(fundingIntents.id, fundingIntentId))
    .limit(1);
  if (!intent) throw new Error(`Funding intent ${fundingIntentId} not found`);
  if (intent.status === "funded") {
    return {
      txHash: intent.fundingTxHash ?? "",
      onchainOrderId: "",
    };
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, intent.orderId))
    .limit(1);
  if (!order) throw new Error(`Order ${intent.orderId} not found`);

  const [buyer] = await db
    .select()
    .from(users)
    .where(eq(users.id, order.buyerId))
    .limit(1);
  if (!buyer?.email) throw new Error(`Buyer user missing for order ${order.id}`);

  await db
    .update(fundingIntents)
    .set({ status: "funding" })
    .where(eq(fundingIntents.id, intent.id));

  await db
    .update(orders)
    .set({ status: "onchain_funding_pending", updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  const onchainOrderId = await assignOnchainOrderId(db, order);
  const { buyerAddress, associationAddress, policyHash } =
    await resolveOrderAddresses(db, order);

  if (!intent.paymentReferenceHash) {
    throw new Error("payment_reference_hash missing on funding intent");
  }

  if (order.targetWeightGrams == null || order.targetWeightGrams <= 0n) {
    throw new Error(
      `Order ${order.id} missing targetWeightGrams — required for on-chain createOrder`,
    );
  }

  onLog(
    `buyer-fund start order=${onchainOrderId.toString()} buyer=${buyerAddress} email=${buyer.email}`,
  );

  const txHash = await ensureAndFundOrderAsBuyer({
    onchainOrderId,
    buyerAddress: buyerAddress as Address,
    buyerEmail: buyer.email,
    associationAddress: associationAddress as Address,
    pricingPolicyHash: policyHash as Hex,
    budgetUsdcUnits: intent.usdcUnits,
    targetWeightGrams: order.targetWeightGrams,
    amount: intent.usdcUnits,
    paymentReferenceHash: intent.paymentReferenceHash as Hex,
    onLog,
  });

  await db
    .update(fundingIntents)
    .set({
      status: "funded",
      fundingTxHash: txHash,
    })
    .where(eq(fundingIntents.id, intent.id));

  await db
    .update(orders)
    .set({
      status: "funded",
      fundedUsdcUnits: intent.usdcUnits,
      remainingUsdcUnits: intent.usdcUnits,
      onchainOrderId,
      txHash,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  return { txHash, onchainOrderId: onchainOrderId.toString() };
}

export async function markFundOrderFailed(
  db: Database,
  fundingIntentId: string,
  reason: string,
) {
  await db
    .update(fundingIntents)
    .set({ status: "failed" })
    .where(eq(fundingIntents.id, fundingIntentId));

  const [intent] = await db
    .select()
    .from(fundingIntents)
    .where(eq(fundingIntents.id, fundingIntentId))
    .limit(1);
  if (intent) {
    await db
      .update(orders)
      .set({ status: "funding_failed", updatedAt: new Date() })
      .where(eq(orders.id, intent.orderId));
  }

  return reason;
}
