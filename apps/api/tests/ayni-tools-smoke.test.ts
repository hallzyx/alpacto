/**
 * Smoke test: every Ayni chatbot tool handler runs against the seeded DB.
 * Catches stale Drizzle column refs / SQL errors like the old auditRuns.createdAt bug.
 *
 * Requires: yarn docker:up && yarn db:migrate && yarn db:seed
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDb,
  lots,
  orders,
  organizationMembers,
  organizations,
  users,
  type Database,
} from "@alpacto/database";
import { createAyniProducerToolHandlers, AYNI_PRODUCER_TOOLS } from "../src/lib/ayni-producer-tools.js";
import {
  createAyniAssociationToolHandlers,
  AYNI_ASSOCIATION_TOOLS,
} from "../src/lib/ayni-association-tools.js";
import { createAyniBuyerToolHandlers, AYNI_BUYER_TOOLS } from "../src/lib/ayni-buyer-tools.js";
import { resolveAssociationOrgIds } from "../src/lib/ayni-role-scope.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://alpacto:alpacto@localhost:5432/alpacto";

/** Postgres / Drizzle schema mismatch signatures */
function looksLikeSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column .* does not exist|relation .* does not exist|undefined column|invalid input syntax for type uuid|Cannot read properties of undefined/i.test(
    msg,
  );
}

async function runTool(
  handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const handler = handlers[name];
  expect(handler, `missing handler for ${name}`).toBeTypeOf("function");
  try {
    const result = await handler!(args);
    // Soft tool errors are OK; schema crashes usually throw
    if (result && typeof result === "object" && "error" in result) {
      const soft = String((result as { error: unknown }).error);
      expect(looksLikeSchemaError(soft), `${name} soft-error looks like schema bug: ${soft}`).toBe(
        false,
      );
    }
    return result;
  } catch (err) {
    if (looksLikeSchemaError(err)) {
      throw new Error(`${name} failed with schema/SQL error: ${err instanceof Error ? err.message : err}`);
    }
    throw err;
  }
}

function declaredToolNames(tools: { function: { name: string } }[]) {
  return tools.map((t) => t.function.name);
}

describe("ayni tools schema smoke", () => {
  let db: Database;
  let pool: { end: () => Promise<void> };
  let producerId = "";
  let associationUserId = "";
  let buyerId = "";
  let orgIds: string[] = [];
  let orderId = "";
  let orderRef = "ALP-2026-001";
  let lotId = "";
  let campaignId = "";
  let disputeId: string | undefined;

  beforeAll(async () => {
    const created = createDb(DATABASE_URL);
    db = created.db;
    pool = created.pool;

    const healthy = await pool
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false);
    if (!healthy) {
      throw new Error("Postgres not reachable. Run yarn docker:up && yarn db:seed");
    }

    const [producer] = await db
      .select()
      .from(users)
      .where(eq(users.email, "martina@demo.alpacto"))
      .limit(1);
    const [association] = await db
      .select()
      .from(users)
      .where(eq(users.email, "alpasur@demo.alpacto"))
      .limit(1);
    const [buyer] = await db
      .select()
      .from(users)
      .where(eq(users.email, "andes@demo.alpacto"))
      .limit(1);
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.externalRef, "ALP-2026-001"))
      .limit(1);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Asociación AlpaSur"))
      .limit(1);

    if (!producer || !association || !buyer || !order || !org) {
      throw new Error("Seed data missing. Run yarn db:seed");
    }

    producerId = producer.id;
    associationUserId = association.id;
    buyerId = buyer.id;
    orderId = order.id;
    orderRef = order.externalRef ?? orderId;
    campaignId = order.campaignId;
    orgIds = await resolveAssociationOrgIds(db, associationUserId, false);

    // Ensure Martina is linked and has at least one lot for tool args
    await db
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: producerId, memberRole: "producer" })
      .onConflictDoNothing();

    let [lot] = await db
      .select()
      .from(lots)
      .where(eq(lots.producerId, producerId))
      .limit(1);
    if (!lot) {
      const [createdLot] = await db
        .insert(lots)
        .values({
          orderId,
          producerId,
          status: "awaiting_producer_confirmation",
        })
        .returning();
      lot = createdLot!;
    }
    lotId = lot.id;
  }, 30_000);

  afterAll(async () => {
    await pool.end();
  });

  it("every declared producer tool has a handler", () => {
    const handlers = createAyniProducerToolHandlers({
      db,
      producerId,
      openIntegrityDispute: async () => ({ ok: true }),
    });
    for (const name of declaredToolNames(AYNI_PRODUCER_TOOLS)) {
      expect(handlers[name], name).toBeTypeOf("function");
    }
  });

  it("every declared association tool has a handler", () => {
    const handlers = createAyniAssociationToolHandlers({ db, orgIds });
    for (const name of declaredToolNames(AYNI_ASSOCIATION_TOOLS)) {
      expect(handlers[name], name).toBeTypeOf("function");
    }
  });

  it("every declared buyer tool has a handler", () => {
    const handlers = createAyniBuyerToolHandlers({ db, buyerId });
    for (const name of declaredToolNames(AYNI_BUYER_TOOLS)) {
      expect(handlers[name], name).toBeTypeOf("function");
    }
  });

  it("runs all producer tool handlers without schema errors", async () => {
    const handlers = createAyniProducerToolHandlers({
      db,
      producerId,
      openIntegrityDispute: async (id, note) => ({
        disputeId: "smoke-skip",
        lotId: id,
        note: note ?? null,
        skipped: true,
      }),
    });

    await runTool(handlers, "list_my_lots");
    await runTool(handlers, "get_my_lot", { lotId });
    await runTool(handlers, "get_my_lot", { lotId: lotId.slice(0, 8) });
    await runTool(handlers, "get_my_lot_settlement", { lotId });
    await runTool(handlers, "get_my_order_capacity", { orderId: orderRef });
    await runTool(handlers, "get_my_order_capacity", { lotId });
    // Historical failure mode: orderBy on non-existent audit_runs.created_at
    await runTool(handlers, "get_my_ayni_findings", { lotId });
    await runTool(handlers, "verify_lot_integrity", { lotId });
    // Gate should soft-fail without anomaly — must not throw SQL
    await runTool(handlers, "open_integrity_dispute", { lotId, note: "smoke" });
  });

  it("runs all association tool handlers without schema errors", async () => {
    const handlers = createAyniAssociationToolHandlers({ db, orgIds });

    await runTool(handlers, "list_my_campaigns");
    await runTool(handlers, "list_my_orders");
    await runTool(handlers, "list_my_lots");
    await runTool(handlers, "get_my_lot", { lotId });
    await runTool(handlers, "get_my_lot", { lotId: lotId.slice(0, 8) });
    const disputes = (await runTool(handlers, "list_my_disputes")) as {
      disputes?: { id: string }[];
    };
    disputeId = disputes.disputes?.[0]?.id;
    if (disputeId) {
      await runTool(handlers, "get_my_dispute", { disputeId });
    } else {
      // Still exercise handler with bogus id — soft error only
      await runTool(handlers, "get_my_dispute", { disputeId: "00000000-0000-0000-0000-000000000000" });
    }
    await runTool(handlers, "get_my_lot_settlement", { lotId });
    await runTool(handlers, "get_my_ayni_findings", { lotId });
    await runTool(handlers, "get_order_capacity", { orderId: orderRef });
    await runTool(handlers, "get_order_capacity", { lotId: lotId.slice(0, 8) });
  });

  it("runs all buyer tool handlers without schema errors", async () => {
    const handlers = createAyniBuyerToolHandlers({ db, buyerId });

    await runTool(handlers, "list_my_orders");
    await runTool(handlers, "get_my_order", { orderId: orderRef });
    await runTool(handlers, "get_my_order_funding", { orderId });
    await runTool(handlers, "list_order_lots", { orderId });
    await runTool(handlers, "get_order_lot", { lotId });
    await runTool(handlers, "get_order_lot", { lotId: lotId.slice(0, 8) });
    await runTool(handlers, "get_campaign_pricing", { campaignId });
    await runTool(handlers, "get_campaign_pricing", { orderId: orderRef });
    await runTool(handlers, "get_lot_settlement", { lotId });
    await runTool(handlers, "get_lot_settlement", { lotId: lotId.slice(0, 8) });
  });
});
