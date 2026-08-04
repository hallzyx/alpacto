/**
 * Phase 2 API checkpoint (no chain / ZeroDev / AI).
 *
 *   yarn docker:up && yarn db:migrate && yarn db:seed
 *   yarn api:dev   # separate terminal
 *   yarn phase2
 */
import { createDb, orders } from "@alpacto/database";
import { eq } from "drizzle-orm";

const API = process.env["API_URL"] ?? "http://127.0.0.1:4000";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://alpacto:alpacto@localhost:5432/alpacto";

async function req(path: string, init: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const ready = await req("/health/ready");
  if (!ready.database) throw new Error("Database not ready — run docker:up + db:migrate");

  const { db, pool } = createDb(DATABASE_URL);
  const [seedOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.externalRef, "ALP-2026-001"))
    .limit(1);
  await pool.end();
  if (!seedOrder) throw new Error("Seeded order missing — run db:seed");

  console.log("🔐 demo-login (inspector)");
  const login = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "carlos@demo.alpacto" }),
  });
  const token = login.token as string;

  console.log("📋 list campaigns");
  const { campaigns } = await req("/campaigns", {}, token);
  if (!campaigns?.length) throw new Error("No seeded campaign");

  const buyerLogin = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "andes@demo.alpacto" }),
  });
  const buyerToken = buyerLogin.token as string;

  const orderRes = await req(`/orders/${seedOrder.id}`, {}, buyerToken);
  console.log("  order:", orderRes.externalRef, orderRes.status);

  const assocLogin = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "alpasur@demo.alpacto" }),
  });
  const assocToken = assocLogin.token as string;

  const producerLogin = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "martina@demo.alpacto" }),
  });
  const producerId = producerLogin.user.id as string;

  console.log("📦 register lot");
  const lot = await req(
    "/lots",
    {
      method: "POST",
      body: JSON.stringify({
        orderId: orderRes.id,
        producerId,
      }),
    },
    assocToken,
  );

  console.log("📎 evidence upload-url");
  const evidence = await req(
    "/evidence/upload-url",
    {
      method: "POST",
      body: JSON.stringify({
        type: "scale_photo",
        mimeType: "image/jpeg",
        sizeBytes: "102400",
      }),
    },
    token,
  );

  console.log("⚖️  submit inspection v1");
  await req(
    `/lots/${lot.id}/inspections`,
    {
      method: "POST",
      body: JSON.stringify({
        weightGrams: "41500",
        categoryCode: "FINE",
        evidenceBundleHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        evidenceFileIds: [evidence.evidenceId],
      }),
    },
    token,
  );

  console.log("📜 timeline");
  const timeline = await req(`/lots/${lot.id}/timeline`, {}, token);
  console.log("  inspections:", timeline.inspections.length);

  console.log("\n🎉 Phase 2 API flow complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
