import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { users, type Database } from "@alpacto/database";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";

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
