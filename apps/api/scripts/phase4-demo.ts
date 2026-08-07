/**
 * Phase 4 checkpoint — Stripe test USD → Sepolia USDC escrow.
 *
 * Prerequisites:
 *   yarn docker:up && yarn db:migrate && yarn db:seed
 *   yarn api:dev                    # workers + API
 *   stripe listen --forward-to localhost:4000/webhooks/stripe
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ALPACTO_CONTRACT_ADDRESS,
 *      TREASURY_PRIVATE_KEY, DEMO_BUYER_SMART_ACCOUNT, DEMO_ASSOCIATION_SMART_ACCOUNT
 *
 *   yarn phase4
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { readOrderEscrow } from "../src/lib/treasury.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const API = process.env["API_URL"] ?? "http://127.0.0.1:4000";

async function req(pathname: string, init: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${pathname}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${pathname} → ${res.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollFundingStatus(
  orderId: string,
  token: string,
  timeoutMs = 180_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await req(`/orders/${orderId}/funding-status`, {}, token);
    if (status.orderStatus === "funded" && status.intent?.status === "funded") {
      return status;
    }
    if (status.intent?.status === "failed") {
      throw new Error(`Funding failed: ${JSON.stringify(status)}`);
    }
    await sleep(3000);
  }
  throw new Error("Timed out waiting for funded status");
}

async function simulatePaidWebhook(opts: {
  sessionId: string;
  orderId: string;
  fundingIntentId: string;
}) {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET missing");

  const event = {
    id: `evt_phase4_${Date.now()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: opts.sessionId,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: `pi_phase4_${Date.now()}`,
        metadata: {
          orderId: opts.orderId,
          fundingIntentId: opts.fundingIntentId,
        },
      },
    },
  };

  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  const res = await fetch(`${API}/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Webhook failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const ready = await req("/health/ready");
  if (!ready.database) {
    throw new Error("Database not ready — run docker:up + db:migrate");
  }

  if (!process.env["ALPACTO_CONTRACT_ADDRESS"]) {
    throw new Error("ALPACTO_CONTRACT_ADDRESS missing — deploy to Sepolia first");
  }
  if (!process.env["STRIPE_SECRET_KEY"]) {
    throw new Error("STRIPE_SECRET_KEY missing");
  }

  console.log("🔐 buyer login");
  const buyerLogin = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "andes@demo.alpacto" }),
  });
  const buyerToken = buyerLogin.token as string;

  const { campaigns: campaignList } = await req("/campaigns", {}, buyerToken);
  const campaign = campaignList[0];
  if (!campaign) throw new Error("No campaign found");

  console.log("📋 create draft order ($10 demo)");
  const order = await req(
    "/orders",
    {
      method: "POST",
      body: JSON.stringify({
        campaignId: campaign.id,
        externalRef: `PHASE4-${Date.now()}`,
        budgetUsdCents: "1000",
      }),
    },
    buyerToken,
  );

  console.log("💳 create Stripe Checkout session");
  const fundingBody = process.env["DEMO_FUNDING_PASSWORD"]?.trim()
    ? JSON.stringify({ confirmPassword: process.env["DEMO_FUNDING_PASSWORD"].trim() })
    : "{}";
  const session = await req(
    `/orders/${order.id}/funding-session`,
    { method: "POST", body: fundingBody },
    buyerToken,
  );
  console.log("  checkout url:", session.url);
  console.log("  (test card 4242… or simulated webhook below)");

  console.log("🔔 simulate checkout.session.completed webhook");
  await simulatePaidWebhook({
    sessionId: session.sessionId,
    orderId: order.id,
    fundingIntentId: session.fundingIntentId,
  });

  console.log("⏳ poll funding-status until onchain funded");
  const funded = await pollFundingStatus(order.id, buyerToken);
  console.log("  order status:", funded.orderStatus);
  console.log("  funding tx:", funded.fundingTxHash ?? funded.intent?.fundingTxHash);

  if (funded.onchainOrderId) {
    const escrow = await readOrderEscrow(BigInt(funded.onchainOrderId));
    console.log("🔗 onchain escrow funded:", escrow.fundedUsdc.toString());
    console.log("   remaining:", escrow.remainingUsdc.toString());
    if (escrow.fundedUsdc < BigInt(session.usdcUnits)) {
      throw new Error("Onchain funded amount lower than expected");
    }
  } else {
    throw new Error("onchain_order_id missing after funding");
  }

  console.log("\n✅ Phase 4 checkpoint: test USD → USDC in escrow on Sepolia");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
