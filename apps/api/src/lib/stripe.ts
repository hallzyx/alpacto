import Stripe from "stripe";
import { config } from "../config.js";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!config.stripe.secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey);
  }
  return stripeClient;
}

export function verifyStripeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  webhookSecret = config.stripe.webhookSecret,
): Stripe.Event {
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return Stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
  );
}
