/**
 * Phase 5 checkpoint — Ayni detects 42.5 vs 41.5 kg and blocks settlement.
 *
 *   yarn docker:up && yarn db:migrate && yarn db:seed
 *   yarn api:dev          # Terminal 1
 *   yarn ayni:dev         # Terminal 2
 *   yarn phase5           # Terminal 3
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import { createDb, orders } from "@alpacto/database";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

process.env["AYNI_USE_FIXTURE_VISION"] = "true";

const API = process.env["API_URL"] ?? "http://127.0.0.1:4000";

async function req(pathname: string, init: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${pathname}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function login(email: string) {
  const { res, body } = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(body)}`);
  return body.token as string;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function uploadFixtureEvidence(token: string, type: "scale_photo" | "classification_doc") {
  const { res, body } = await req(
    "/evidence/upload-url",
    {
      method: "POST",
      body: JSON.stringify({
        type,
        mimeType: "image/jpeg",
        sizeBytes: "1024",
      }),
    },
    token,
  );
  if (!res.ok) throw new Error(`upload-url failed: ${JSON.stringify(body)}`);

  const fixturePath = path.resolve(__dirname, "../fixtures/scale-reading.json");
  const payload = readFileSync(fixturePath);

  const s3 = new S3Client({
    endpoint: process.env["S3_ENDPOINT"] ?? "http://127.0.0.1:9000",
    region: process.env["S3_REGION"] ?? "us-east-1",
    credentials: {
      accessKeyId: process.env["S3_ACCESS_KEY"] ?? "alpacto",
      secretAccessKey: process.env["S3_SECRET_KEY"] ?? "alpacto123",
    },
    forcePathStyle: true,
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env["S3_BUCKET"] ?? "alpacto-evidence",
      Key: body.storageKey,
      Body: payload,
      ContentType: "image/jpeg",
    }),
  );

  return body.evidenceId as string;
}

async function pollAudit(auditId: string, token: string, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { res, body } = await req(`/audits/${auditId}`, {}, token);
    if (!res.ok) throw new Error(`audit poll failed: ${JSON.stringify(body)}`);
    if (["attested", "failed"].includes(body.status) || body.resultCode) {
      return body;
    }
    await sleep(2000);
  }
  throw new Error("Timed out waiting for audit");
}

async function main() {
  const { res: readyRes, body: ready } = await req("/health/ready");
  if (!readyRes.ok || !ready.database) {
    throw new Error("API/database not ready");
  }

  const buyerToken = await login("andes@demo.alpacto");
  const inspectorToken = await login("carlos@demo.alpacto");
  const assocToken = await login("alpasur@demo.alpacto");
  const producerLogin = await req("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "martina@demo.alpacto" }),
  });
  const producerId = producerLogin.body.user.id as string;

  const databaseUrl =
    process.env["DATABASE_URL"] ??
    "postgresql://alpacto:alpacto@localhost:5432/alpacto";
  const { db, pool } = createDb(databaseUrl);
  const [seedOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.externalRef, "ALP-2026-001"))
    .limit(1);
  await pool.end();
  if (!seedOrder) throw new Error("Seeded funded order missing — run db:seed");
  const order = { id: seedOrder.id };

  console.log("📦 register lot on funded seed order", seedOrder.externalRef);
  const { res: lotRes, body: lot } = await req(
    "/lots",
    {
      method: "POST",
      body: JSON.stringify({
        orderId: order.id,
        producerId,
      }),
    },
    assocToken,
  );
  if (!lotRes.ok) throw new Error(`lot failed: ${JSON.stringify(lot)}`);

  console.log("📷 upload evidence fixtures");
  const scaleId = await uploadFixtureEvidence(inspectorToken, "scale_photo");
  const docId = await uploadFixtureEvidence(inspectorToken, "classification_doc");

  console.log("⚖️  submit inspection 42.5 kg FINE");
  const { res: inspRes, body: inspection } = await req(
    `/lots/${lot.id}/inspections`,
    {
      method: "POST",
      body: JSON.stringify({
        weightGrams: "42500",
        categoryCode: "FINE",
        evidenceFileIds: [scaleId, docId],
      }),
    },
    inspectorToken,
  );
  if (!inspRes.ok) throw new Error(`inspection failed: ${JSON.stringify(inspection)}`);

  console.log("🤖 trigger Ayni audit");
  const { res: auditRes, body: audit } = await req(
    `/lots/${lot.id}/audits`,
    { method: "POST", body: "{}" },
    inspectorToken,
  );
  if (!auditRes.ok) throw new Error(`audit trigger failed: ${JSON.stringify(audit)}`);

  console.log("⏳ poll audit result");
  const result = await pollAudit(audit.id, inspectorToken);
  console.log("  status:", result.status, "result:", result.resultCode);

  if (result.resultCode !== "review_required") {
    throw new Error(`Expected review_required, got ${result.resultCode}`);
  }

  console.log("🚫 attempt settlement accept (should block)");
  const { res: settleRes, body: settleBody } = await req(
    `/lots/${lot.id}/settlement/accept`,
    { method: "POST", body: "{}" },
    buyerToken,
  );
  if (settleRes.ok) {
    throw new Error("Settlement should have been blocked");
  }
  if (settleRes.status !== 409) {
    throw new Error(`Expected 409, got ${settleRes.status}: ${JSON.stringify(settleBody)}`);
  }

  console.log("\n✅ Phase 5 checkpoint: discrepancy detected, settlement blocked");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
