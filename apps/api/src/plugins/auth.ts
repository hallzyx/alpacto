import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { users, type Database } from "@alpacto/database";
import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  name: string;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const encoder = new TextEncoder();

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(encoder.encode(config.jwtSecret));
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, encoder.encode(config.jwtSecret));
  if (!payload.sub || typeof payload.email !== "string" || typeof payload.role !== "string") {
    throw new ApiError(401, "Invalid token");
  }
  return {
    id: String(payload.sub),
    email: payload.email,
    role: payload.role,
    name: typeof payload.name === "string" ? payload.name : "",
  };
}

export function authPlugin(db: Database) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing bearer token" });
      return;
    }
    try {
      const tokenUser = await verifyToken(header.slice(7));
      const [row] = await db.select().from(users).where(eq(users.id, tokenUser.id)).limit(1);
      if (!row || row.status !== "active") {
        reply.code(401).send({ error: "User not found or inactive" });
        return;
      }
      request.user = {
        id: row.id,
        email: row.email,
        role: row.role,
        name: row.name,
      };
    } catch {
      reply.code(401).send({ error: "Invalid token" });
    }
  };
}

export function requireRoles(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(request.user.role) && request.user.role !== "admin") {
      reply.code(403).send({ error: "Forbidden" });
    }
  };
}
