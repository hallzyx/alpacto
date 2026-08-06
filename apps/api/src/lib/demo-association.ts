import { eq } from "drizzle-orm";
import { organizationMembers, organizations, type Database } from "@alpacto/database";

/** Seeded demo association name (see packages/database/src/seed.ts). */
export const DEMO_ASSOCIATION_NAME = "Asociación AlpaSur";

/**
 * Demo convenience: every newly registered producer is attached to AlpaSur so
 * the association can assign them on lot registration without a manual invite.
 */
export async function ensureProducerInDemoAssociation(db: Database, userId: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, DEMO_ASSOCIATION_NAME))
    .limit(1);
  if (!org) return null;

  await db
    .insert(organizationMembers)
    .values({
      organizationId: org.id,
      userId,
      memberRole: "producer",
    })
    .onConflictDoNothing();

  return org.id;
}
