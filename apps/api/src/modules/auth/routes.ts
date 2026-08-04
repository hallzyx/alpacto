import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@alpacto/database";
import { demoLoginSchema } from "@alpacto/shared-schemas";
import { signToken } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";

export async function registerAuthRoutes(app: FastifyInstance, db: Database) {
  app.post("/auth/demo-login", async (request) => {
    const body = demoLoginSchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user) {
      throw new ApiError(404, "Demo user not found. Run db:seed first.");
    }
    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    };
  });
}
