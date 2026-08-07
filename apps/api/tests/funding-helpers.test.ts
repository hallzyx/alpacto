/**
 * resolveAssociationUser must pick role=association when the org also lists producers.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, organizationMembers, users, type Database } from "@alpacto/database";
import { resolveAssociationUser } from "../src/lib/funding-helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://alpacto:alpacto@localhost:5432/alpacto";

describe("resolveAssociationUser", () => {
  let db: Database;
  let pool: { end: () => Promise<void> };

  beforeAll(async () => {
    const conn = createDb(DATABASE_URL);
    db = conn.db;
    pool = conn.pool;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns association user, not a producer member of the same org", async () => {
    const [alpasur] = await db
      .select()
      .from(users)
      .where(eq(users.email, "alpasur@demo.alpacto"))
      .limit(1);
    expect(alpasur).toBeDefined();

    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, alpasur!.id))
      .limit(1);
    expect(member).toBeDefined();

    const resolved = await resolveAssociationUser(db, member!.organizationId);
    expect(resolved?.id).toBe(alpasur!.id);
    expect(resolved?.email).toBe("alpasur@demo.alpacto");
    expect(resolved?.role).toBe("association");
    expect(resolved?.smartAccountAddress).toBeTruthy();
  });
});
