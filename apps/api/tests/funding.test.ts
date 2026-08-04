import { describe, expect, it } from "vitest";
import {
  assertWithinDemoMaxUsdc,
  usdCentsToUsdcUnits,
} from "@alpacto/domain";
import Stripe from "stripe";
import { verifyStripeWebhook } from "../src/lib/stripe.js";
import { paymentReferenceHashFromStripeId } from "../src/lib/treasury.js";

describe("usdCentsToUsdcUnits", () => {
  it("converts 1:1 demo at 6 decimals", () => {
    expect(usdCentsToUsdcUnits(10_000n)).toBe(100_000_000n);
    expect(usdCentsToUsdcUnits(1n)).toBe(10_000n);
  });

  it("rejects non-positive amounts", () => {
    expect(() => usdCentsToUsdcUnits(0n)).toThrow();
  });
});

describe("assertWithinDemoMaxUsdc", () => {
  it("allows amounts within cap", () => {
    expect(() => assertWithinDemoMaxUsdc(1_000_000n, 10_000n)).not.toThrow();
  });

  it("rejects amounts above cap", () => {
    expect(() => assertWithinDemoMaxUsdc(11_000_000_000n, 10_000n)).toThrow();
  });
});

describe("paymentReferenceHashFromStripeId", () => {
  it("returns deterministic keccak hash", () => {
    const a = paymentReferenceHashFromStripeId("cs_test_abc");
    const b = paymentReferenceHashFromStripeId("cs_test_abc");
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe("verifyStripeWebhook", () => {
  it("rejects invalid signature", () => {
    const payload = Buffer.from(JSON.stringify({ id: "evt_test" }));
    expect(() => verifyStripeWebhook(payload, "bad-signature")).toThrow();
  });

  it("accepts test header from Stripe helper", () => {
    const secret = "whsec_test_secret_for_unit_tests";

    const payload = JSON.stringify({
      id: "evt_test_123",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test" } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const event = verifyStripeWebhook(Buffer.from(payload), header, secret);
    expect(event.id).toBe("evt_test_123");
  });
});
