/**
 * Phase 6 smoke — API surfaces needed by the Web 2.5 UX.
 *
 *   yarn docker:up && yarn db:migrate && yarn db:seed
 *   yarn api:dev
 *   yarn phase6
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

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
    throw new Error(`${init.method ?? "GET"} ${pathname} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  await req("/health/ready");

  const buyer = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "andes@demo.alpacto" }),
  });
  const inspector = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "carlos@demo.alpacto" }),
  });

  const orders = await req("/orders", {}, buyer.token);
  if (!orders.orders?.length) throw new Error("Expected seeded orders");

  const campaigns = await req("/campaigns", {}, buyer.token);
  const policyId = campaigns.campaigns?.[0]?.pricingPolicyId;
  if (!policyId) throw new Error("No campaign pricing policy");
  const policy = await req(`/pricing-policies/${policyId}`, {}, buyer.token);
  if (!policy.categories?.length) throw new Error("Pricing categories missing");

  const producer = await req("/auth/producer/session", {
    method: "POST",
    body: JSON.stringify({
      email: `phase6-producer-${Date.now()}@demo.alpacto`,
      name: "Productor Fase 6",
      smartAccountAddress: "0x1111111111111111111111111111111111111111",
      authMethod: "email_otp",
    }),
  });
  if (!producer.token) throw new Error("producer session failed");

  const lots = await req("/lots", {}, inspector.token);
  console.log("orders:", orders.orders.length, "lots:", lots.lots?.length ?? 0);
  console.log("producer session ok:", producer.user.email);
  console.log("\n✅ Phase 6 API smoke OK — open http://localhost:3000 for UX demo");
  console.log("   See docs/demo-script.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
