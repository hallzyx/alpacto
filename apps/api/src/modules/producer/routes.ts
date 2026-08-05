import type { FastifyInstance } from "fastify";
import type { Database } from "@alpacto/database";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { loadProducerLotContext, loadProducerParticipation } from "../../lib/producer-context.js";

export async function registerProducerRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/producer/participation", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== "producer" && user.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const producerId = user.role === "admin" ? user.id : user.id;
    return loadProducerParticipation(db, producerId);
  });

  app.get("/producer/lots/:id/context", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== "producer" && user.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };
    const context = await loadProducerLotContext(db, user.id, lotId);
    if (!context) throw new ApiError(404, "Lot not found");
    return context;
  });
}
