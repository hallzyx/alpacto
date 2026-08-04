import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { campaigns, orders, organizations, type Database } from "@alpacto/database";
import { createOrderSchema } from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";

function serializeOrder(row: typeof orders.$inferSelect) {
  return {
    id: row.id,
    externalRef: row.externalRef,
    onchainOrderId: row.onchainOrderId?.toString() ?? null,
    campaignId: row.campaignId,
    buyerId: row.buyerId,
    associationId: row.associationId,
    budgetUsdCents: row.budgetUsdCents.toString(),
    fundedUsdcUnits: row.fundedUsdcUnits.toString(),
    remainingUsdcUnits: row.remainingUsdcUnits.toString(),
    status: row.status,
    txHash: row.txHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function registerOrderRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.post("/orders", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["buyer", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const body = createOrderSchema.parse(request.body);
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, body.campaignId))
      .limit(1);
    if (!campaign) throw new ApiError(404, "Campaign not found");

    const associationId = body.associationId ?? campaign.organizationId;
    const [association] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, associationId))
      .limit(1);
    if (!association) throw new ApiError(404, "Association not found");

    const [row] = await db
      .insert(orders)
      .values({
        campaignId: body.campaignId,
        buyerId: user.role === "admin" ? campaign.buyerId : user.id,
        associationId,
        externalRef: body.externalRef,
        budgetUsdCents: body.budgetUsdCents,
        fundedUsdcUnits: 0n,
        remainingUsdcUnits: 0n,
        status: "draft",
      })
      .returning();
    if (!row) throw new ApiError(500, "Failed to create order");
    return serializeOrder(row);
  });

  app.get("/orders/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Order not found");
    return serializeOrder(row);
  });
}
