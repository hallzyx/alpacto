import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { pricingCategories, pricingPolicies, type Database } from "@alpacto/database";
import { ApiError } from "../../lib/errors.js";

export async function registerPricingRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.get("/pricing-policies/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [policy] = await db
      .select()
      .from(pricingPolicies)
      .where(eq(pricingPolicies.id, id))
      .limit(1);
    if (!policy) throw new ApiError(404, "Pricing policy not found");

    const categories = await db
      .select()
      .from(pricingCategories)
      .where(eq(pricingCategories.pricingPolicyId, id));

    return {
      id: policy.id,
      version: policy.version,
      currency: policy.currency,
      associationFeeBps: policy.associationFeeBps,
      weightToleranceBps: policy.weightToleranceBps,
      penPerUsdcMicros: policy.penPerUsdcMicros.toString(),
      policyHash: policy.policyHash,
      categories: categories.map((c) => ({
        code: c.code,
        label: c.label,
        pricePenMinorPerKg: c.pricePenMinorPerKg.toString(),
        qualityBonusPenMinorPerKg: c.qualityBonusPenMinorPerKg.toString(),
      })),
    };
  });
}
