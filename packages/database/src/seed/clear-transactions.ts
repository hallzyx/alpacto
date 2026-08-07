import type { Database } from "../index.js";
import {
  auditFindings,
  auditRuns,
  campaigns,
  evidenceFiles,
  fundingIntents,
  inspections,
  localPayouts,
  lotDisputes,
  lots,
  orders,
  reweighRequests,
  settlements,
} from "../schema/index.js";

/**
 * Delete all transactional demo traffic while keeping users, orgs, memberships,
 * pricing policies/categories, and wallets.
 *
 * FKs are ON DELETE NO ACTION — must delete children first.
 */
export async function clearTransactions(db: Database): Promise<void> {
  console.log("🧹 Clearing transactional tables…");

  await db.delete(auditFindings);
  await db.delete(localPayouts);
  await db.delete(evidenceFiles);

  await db.delete(auditRuns);
  await db.delete(inspections);
  await db.delete(settlements);
  await db.delete(reweighRequests);
  await db.delete(lotDisputes);

  await db.delete(lots);
  await db.delete(fundingIntents);
  await db.delete(orders);
  await db.delete(campaigns);

  console.log("  cleared campaigns → orders → lots and dependents");
}
