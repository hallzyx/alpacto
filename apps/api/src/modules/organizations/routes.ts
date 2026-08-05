import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { organizations, type Database } from "@alpacto/database";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { z } from "zod";

export async function registerOrganizationRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/organizations", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["buyer", "association", "admin", "inspector"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const query = z
      .object({
        type: z.string().optional(),
      })
      .parse(request.query ?? {});

    const rows = query.type
      ? await db
          .select()
          .from(organizations)
          .where(eq(organizations.type, query.type))
          .orderBy(asc(organizations.name))
      : await db.select().from(organizations).orderBy(asc(organizations.name));

    return {
      organizations: rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}
