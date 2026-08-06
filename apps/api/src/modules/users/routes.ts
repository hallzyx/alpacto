import type { FastifyInstance } from "fastify";
import { and, asc, eq, inArray } from "drizzle-orm";
import { organizationMembers, users, type Database } from "@alpacto/database";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { resolveAssociationOrgIds } from "../../lib/ayni-role-scope.js";

function serializeProducer(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    smartAccountAddress: row.smartAccountAddress,
  };
}

export async function registerUserRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/users/producers", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["association", "inspector", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }

    // Association users only see producers attached to their org(s).
    if (user.role === "association") {
      const orgIds = await resolveAssociationOrgIds(db, user.id, false);
      if (orgIds.length === 0) return { producers: [] };

      const memberRows = await db
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(inArray(organizationMembers.organizationId, orgIds));
      const memberIds = [...new Set(memberRows.map((r) => r.userId))];
      if (memberIds.length === 0) return { producers: [] };

      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.role, "producer"), inArray(users.id, memberIds)))
        .orderBy(asc(users.name));
      return { producers: rows.map(serializeProducer) };
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.role, "producer"))
      .orderBy(asc(users.name));
    return { producers: rows.map(serializeProducer) };
  });

  app.get("/users/buyers", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["association", "admin", "buyer"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.role, "buyer"))
      .orderBy(asc(users.name));
    return {
      buyers: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
      })),
    };
  });
}
