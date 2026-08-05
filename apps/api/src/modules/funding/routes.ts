import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { fundingIntents, orders, type Database } from "@alpacto/database";
import {
  assertWithinDemoMaxUsdc,
  usdCentsToUsdcUnits,
} from "@alpacto/domain";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { getStripe } from "../../lib/stripe.js";
import { config } from "../../config.js";
import type { Queues } from "../../jobs/queues.js";
import { paymentReferenceHashFromStripeId } from "../../lib/treasury.js";

function serializeFundingIntent(row: typeof fundingIntents.$inferSelect) {
  return {
    id: row.id,
    orderId: row.orderId,
    stripeSessionId: row.stripeSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    stripeEventId: row.stripeEventId,
    usdCents: row.usdCents.toString(),
    usdcUnits: row.usdcUnits.toString(),
    paymentReferenceHash: row.paymentReferenceHash,
    status: row.status,
    fundingTxHash: row.fundingTxHash,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadOrderForFunding(db: Database, orderId: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) throw new ApiError(404, "Order not found");
  return row;
}

function assertBuyerAccess(user: AuthUser, order: typeof orders.$inferSelect) {
  if (user.role === "admin") return;
  if (user.role !== "buyer" || order.buyerId !== user.id) {
    throw new ApiError(403, "Forbidden");
  }
}

export async function registerFundingRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
  queues: Queues,
) {
  app.post(
    "/orders/:id/funding-session",
    { preHandler: authenticate },
    async (request) => {
      const user = request.user as AuthUser;
      const { id: orderId } = request.params as { id: string };
      const order = await loadOrderForFunding(db, orderId);
      assertBuyerAccess(user, order);

      if (!["draft", "payment_pending", "funding_failed"].includes(order.status)) {
        throw new ApiError(400, "Order is not eligible for funding");
      }

      // Allow retry after a failed on-chain fund (Stripe can be re-run for a new intent).
      if (order.status === "funding_failed") {
        await db
          .update(orders)
          .set({
            status: "draft",
            fundedUsdcUnits: 0n,
            remainingUsdcUnits: 0n,
            txHash: null,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
      }

      const usdCents = order.budgetUsdCents;
      const usdcUnits = usdCentsToUsdcUnits(usdCents);
      assertWithinDemoMaxUsdc(usdcUnits, config.demo.maxFundingUsdc);

      const [intent] = await db
        .insert(fundingIntents)
        .values({
          orderId: order.id,
          usdCents,
          usdcUnits,
          status: "pending",
        })
        .returning();
      if (!intent) throw new ApiError(500, "Failed to create funding intent");

      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Number(usdCents),
              product_data: {
                name: `Alpacto order ${order.externalRef ?? order.id}`,
                description: "Demo escrow funding (test mode)",
              },
            },
          },
        ],
        success_url: `${config.appUrl}/buyer/orders/${order.id}?funding=success`,
        cancel_url: `${config.appUrl}/buyer/orders/${order.id}?funding=cancelled`,
        metadata: {
          orderId: order.id,
          fundingIntentId: intent.id,
        },
      });

      const paymentReferenceHash = paymentReferenceHashFromStripeId(session.id);
      const [updatedIntent] = await db
        .update(fundingIntents)
        .set({
          stripeSessionId: session.id,
          paymentReferenceHash,
        })
        .where(eq(fundingIntents.id, intent.id))
        .returning();

      await db
        .update(orders)
        .set({ status: "payment_pending", updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      return {
        fundingIntentId: updatedIntent!.id,
        sessionId: session.id,
        url: session.url,
        usdCents: usdCents.toString(),
        usdcUnits: usdcUnits.toString(),
      };
    },
  );

  app.get(
    "/orders/:id/funding-status",
    { preHandler: authenticate },
    async (request) => {
      const user = request.user as AuthUser;
      const { id: orderId } = request.params as { id: string };
      const order = await loadOrderForFunding(db, orderId);
      assertBuyerAccess(user, order);

      const [intent] = await db
        .select()
        .from(fundingIntents)
        .where(eq(fundingIntents.orderId, orderId))
        .orderBy(desc(fundingIntents.createdAt))
        .limit(1);

      return {
        orderId: order.id,
        orderStatus: order.status,
        onchainOrderId: order.onchainOrderId?.toString() ?? null,
        fundedUsdcUnits: order.fundedUsdcUnits.toString(),
        remainingUsdcUnits: order.remainingUsdcUnits.toString(),
        fundingTxHash: order.txHash,
        intent: intent ? serializeFundingIntent(intent) : null,
      };
    },
  );
}

export async function registerStripeWebhookRoutes(
  app: FastifyInstance,
  db: Database,
  queues: Queues,
) {
  app.register(async (webhookApp) => {
    webhookApp.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      },
    );

    webhookApp.post("/webhooks/stripe", async (request, reply) => {
      const rawBody = request.body as Buffer;
      const signature = request.headers["stripe-signature"] as string | undefined;

      let event;
      try {
        const { verifyStripeWebhook } = await import("../../lib/stripe.js");
        event = verifyStripeWebhook(rawBody, signature);
      } catch (err) {
        request.log.warn({ err }, "Stripe webhook signature failed");
        return reply.code(400).send({ error: "Invalid signature" });
      }

      if (event.type !== "checkout.session.completed") {
        return { received: true, ignored: true };
      }

      const session = event.data.object as {
        id: string;
        payment_intent?: string | null;
        payment_status?: string;
        metadata?: Record<string, string>;
      };

      if (session.payment_status !== "paid") {
        return { received: true, ignored: true, reason: "not_paid" };
      }

      const orderId = session.metadata?.orderId;
      const fundingIntentId = session.metadata?.fundingIntentId;
      if (!orderId || !fundingIntentId) {
        request.log.warn({ sessionId: session.id }, "Webhook missing metadata");
        return reply.code(400).send({ error: "Missing metadata" });
      }

      const [existingByEvent] = await db
        .select()
        .from(fundingIntents)
        .where(eq(fundingIntents.stripeEventId, event.id))
        .limit(1);
      if (existingByEvent) {
        return { received: true, duplicate: true };
      }

      const [intent] = await db
        .select()
        .from(fundingIntents)
        .where(
          and(
            eq(fundingIntents.id, fundingIntentId),
            eq(fundingIntents.orderId, orderId),
          ),
        )
        .limit(1);
      if (!intent) {
        return reply.code(404).send({ error: "Funding intent not found" });
      }

      if (intent.status === "funded" || intent.status === "funding") {
        return { received: true, duplicate: true };
      }

      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : null;

      const [paidIntent] = await db
        .update(fundingIntents)
        .set({
          status: "paid",
          stripeEventId: event.id,
          stripePaymentIntentId: paymentIntentId,
          stripeSessionId: session.id,
          paymentReferenceHash:
            intent.paymentReferenceHash ??
            paymentReferenceHashFromStripeId(session.id),
        })
        .where(eq(fundingIntents.id, intent.id))
        .returning();

      await db
        .update(orders)
        .set({ status: "payment_confirmed", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await queues.fundOrder.add(
        "fund",
        { fundingIntentId: paidIntent!.id, orderId },
        {
          jobId: `fund-order-${paidIntent!.id}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
        },
      );

      return { received: true, enqueued: true };
    });
  });
}
