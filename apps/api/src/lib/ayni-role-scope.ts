import { and, eq, inArray } from "drizzle-orm";
import {
  lots,
  organizationMembers,
  organizations,
  orders,
  type Database,
} from "@alpacto/database";
import { ApiError } from "./errors.js";

export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Org IDs the association user belongs to. Admin → all active association orgs. */
export async function resolveAssociationOrgIds(
  db: Database,
  userId: string,
  isAdmin: boolean,
): Promise<string[]> {
  if (isAdmin) {
    const rows = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.type, "association"));
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  return rows.map((r) => r.organizationId);
}

export async function assertAssociationOrder(
  db: Database,
  orgIds: string[],
  orderId: string,
) {
  if (orgIds.length === 0) throw new ApiError(403, "Sin organización de asociación");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || !orgIds.includes(order.associationId)) {
    throw new ApiError(404, "Orden no encontrada en tu asociación");
  }
  return order;
}

export async function assertAssociationLot(db: Database, orgIds: string[], lotId: string) {
  if (orgIds.length === 0) throw new ApiError(403, "Sin organización de asociación");
  const [row] = await db
    .select({ lot: lots, order: orders })
    .from(lots)
    .innerJoin(orders, eq(lots.orderId, orders.id))
    .where(and(eq(lots.id, lotId), inArray(orders.associationId, orgIds)))
    .limit(1);
  if (!row) throw new ApiError(404, "Lote no encontrado en tu asociación");
  return row;
}

export async function assertBuyerOrder(db: Database, buyerId: string, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.buyerId !== buyerId) {
    throw new ApiError(404, "Orden no encontrada");
  }
  return order;
}

export async function assertBuyerLot(db: Database, buyerId: string, lotId: string) {
  const [row] = await db
    .select({ lot: lots, order: orders })
    .from(lots)
    .innerJoin(orders, eq(lots.orderId, orders.id))
    .where(and(eq(lots.id, lotId), eq(orders.buyerId, buyerId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Lote no encontrado en tus órdenes");
  return row;
}

export async function resolveLotByIdOrPrefix(
  candidates: { id: string }[],
  lotIdOrPrefix: string,
) {
  const raw = lotIdOrPrefix.trim();
  if (/^[0-9a-f-]{36}$/i.test(raw)) {
    return candidates.find((l) => l.id === raw) ?? null;
  }
  const matches = candidates.filter((l) => l.id.startsWith(raw) || l.id.startsWith(raw.toLowerCase()));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new ApiError(400, `Varios lotes coinciden con "${raw}". Usa el UUID completo.`);
  }
  return null;
}

export async function resolveOrderByIdOrRef(db: Database, raw: string) {
  const value = raw.trim();
  if (/^[0-9a-f-]{36}$/i.test(value)) {
    const [byId] = await db.select().from(orders).where(eq(orders.id, value)).limit(1);
    if (byId) return byId;
  }
  const [byRef] = await db.select().from(orders).where(eq(orders.externalRef, value)).limit(1);
  return byRef ?? null;
}
