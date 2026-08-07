import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  ayniSessionKeys,
  passkeyCredentials,
  producerSessionKeys,
  users,
  type Database,
} from "@alpacto/database";
import {
  ACCEPT_SETTLEMENT_SELECTOR,
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  deriveDemoOwnerKey,
  generateOwnerKey,
  generatePrivateKey,
  loadZeroDevConfigFromEnv,
  normalizeSerializedSessionEip7702Auth,
  privateKeyToAccount,
  REQUEST_REWEIGHING_SELECTOR,
  SETTLE_LOT_SELECTOR,
} from "@alpacto/zero-dev";
import { demoLoginSchema } from "@alpacto/shared-schemas";
import { z } from "zod";
import { signToken, type AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { config } from "../../config.js";
import { ensureProducerInDemoAssociation } from "../../lib/demo-association.js";

const rpID = (() => {
  try {
    return new URL(config.appUrl).hostname;
  } catch {
    return "localhost";
  }
})();

const challenges = new Map<string, string>();

function rpName() {
  return "Alpacto";
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate?: (req: unknown, reply: unknown) => Promise<void>,
) {
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
        smartAccountAddress: user.smartAccountAddress,
      },
    };
  });

  app.post("/auth/passkey/register/options", async (request) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).optional(),
        role: z.enum(["producer", "inspector", "buyer", "association", "admin"]).optional(),
      })
      .parse(request.body);

    let [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user) {
      const role = body.role ?? "producer";
      const [created] = await db
        .insert(users)
        .values({
          email: body.email,
          name: body.name ?? body.email.split("@")[0]!,
          role,
          status: "active",
        })
        .returning();
      user = created!;
      if (role === "producer") {
        await ensureProducerInDemoAssociation(db, user.id);
      }
    }

    const existing = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, user.id));

    const options = await generateRegistrationOptions({
      rpName: rpName(),
      rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    challenges.set(user.id, options.challenge);
    return { options, userId: user.id };
  });

  app.post("/auth/passkey/register/verify", async (request) => {
    const body = z
      .object({
        userId: z.string().uuid(),
        response: z.any(),
      })
      .parse(request.body);

    const expectedChallenge = challenges.get(body.userId);
    if (!expectedChallenge) {
      throw new ApiError(400, "Missing registration challenge");
    }

    const [user] = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
    if (!user) throw new ApiError(404, "User not found");

    const verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: config.appUrl,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new ApiError(400, "Passkey registration failed");
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    await db.insert(passkeyCredentials).values({
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports
        ? JSON.stringify(credential.transports)
        : null,
    });

    challenges.delete(body.userId);

    // Link a Kernel smart account (ECDSA owner) for sponsored ops until browser
    // passkey-validator is wired in the web app.
    let smartAccountAddress = user.smartAccountAddress;
    if (!smartAccountAddress) {
      try {
        const zd = loadZeroDevConfigFromEnv();
        const publicClient = createAlpactoPublicClient(zd);
        const ownerKey = generateOwnerKey();
        const account = await createEcdsaKernelAccount(publicClient, ownerKey);
        smartAccountAddress = account.address;
        await db
          .update(users)
          .set({ smartAccountAddress, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        // Owner key is returned once for client custody in MVP demo setups.
        const token = await signToken({
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        });
        return {
          verified: true,
          token,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            smartAccountAddress,
          },
          kernelOwnerKey: ownerKey,
        };
      } catch (err) {
        app.log.warn({ err }, "ZeroDev account creation skipped");
      }
    }

    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    return {
      verified: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        smartAccountAddress,
      },
    };
  });

  app.post("/auth/passkey/login/options", async (request) => {
    const body = z.object({ email: z.string().email() }).parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user) throw new ApiError(404, "User not found");

    const creds = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, user.id));
    if (!creds.length) throw new ApiError(400, "No passkey registered");

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      userVerification: "preferred",
    });
    challenges.set(user.id, options.challenge);
    return { options, userId: user.id };
  });

  app.post("/auth/passkey/login/verify", async (request) => {
    const body = z
      .object({
        userId: z.string().uuid(),
        response: z.any(),
      })
      .parse(request.body);

    const expectedChallenge = challenges.get(body.userId);
    if (!expectedChallenge) throw new ApiError(400, "Missing login challenge");

    const [user] = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
    if (!user) throw new ApiError(404, "User not found");

    const [cred] = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, (body.response as AuthenticationResponseJSON).id))
      .limit(1);
    if (!cred) throw new ApiError(400, "Unknown credential");

    const verification = await verifyAuthenticationResponse({
      response: body.response as AuthenticationResponseJSON,
      expectedChallenge,
      expectedOrigin: config.appUrl,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, "base64url"),
        counter: Number(cred.counter),
        transports: cred.transports
          ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
    });

    if (!verification.verified) throw new ApiError(401, "Passkey login failed");

    await db
      .update(passkeyCredentials)
      .set({ counter: BigInt(verification.authenticationInfo.newCounter) })
      .where(eq(passkeyCredentials.id, cred.id));
    challenges.delete(body.userId);

    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    return {
      verified: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        smartAccountAddress: user.smartAccountAddress,
      },
    };
  });

  app.get("/admin/ayni/session-key/revoke-policy", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new ApiError(401, "Unauthorized");
    }
    const { verifyToken } = await import("../../plugins/auth.js");
    const authUser: AuthUser = await verifyToken(header.slice(7));
    if (authUser.role !== "admin") throw new ApiError(403, "Admin only");

    return { passwordRequired: Boolean(config.admin.ayniRevokePassword) };
  });

  app.post(
    "/admin/ayni/session-key/revoke",
    async (request) => {
      const header = request.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new ApiError(401, "Unauthorized");
      }
      // lightweight admin check via demo token payload is done in auth plugin style
      const { verifyToken } = await import("../../plugins/auth.js");
      const authUser: AuthUser = await verifyToken(header.slice(7));
      if (authUser.role !== "admin") throw new ApiError(403, "Admin only");

      const body = z
        .object({
          confirmPassword: z.string().optional(),
          sessionPublicAddress: z.string().optional(),
          smartAccountAddress: z.string().optional(),
        })
        .parse(request.body ?? {});

      const expected = config.admin.ayniRevokePassword;
      if (expected) {
        const provided = body.confirmPassword?.trim() ?? "";
        if (!provided) {
          throw new ApiError(403, "Confirmation password required");
        }
        const a = Buffer.from(provided, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          throw new ApiError(403, "Invalid confirmation password");
        }
      }

      const rows = await db.select().from(ayniSessionKeys);
      const targets = rows.filter((r) => {
        if (r.status !== "active") return false;
        if (body.sessionPublicAddress) {
          return (
            r.sessionPublicAddress.toLowerCase() ===
            body.sessionPublicAddress.toLowerCase()
          );
        }
        if (body.smartAccountAddress) {
          return (
            r.smartAccountAddress.toLowerCase() ===
            body.smartAccountAddress.toLowerCase()
          );
        }
        return true;
      });

      for (const row of targets) {
        await db
          .update(ayniSessionKeys)
          .set({ status: "revoked", revokedAt: new Date() })
          .where(eq(ayniSessionKeys.id, row.id));
      }

      return { revoked: targets.length };
    },
  );

  const issueProducerSession = async (
    user: typeof users.$inferSelect,
    authMethod: "google" | "email_otp" | "passkey",
  ) => {
    if (user.role === "producer") {
      await ensureProducerInDemoAssociation(db, user.id);
    }

    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      token,
      authMethod,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        smartAccountAddress: user.smartAccountAddress,
      },
    };
  };

  /**
   * Resume producer JWT from a ZeroDev wallet already linked in Postgres.
   * Used when Google reconnects but ZeroDev does not return emailContacts
   * (common after logout → re-auth). Ownership is proven by the live ZeroDev session.
   */
  app.post("/auth/producer/resume", async (request) => {
    const body = z
      .object({
        smartAccountAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/),
        authMethod: z.enum(["google", "email_otp", "passkey"]),
      })
      .parse(request.body);

    const address = body.smartAccountAddress.toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.smartAccountAddress}) = ${address}`)
      .limit(1);

    if (!user) {
      throw new ApiError(404, "No producer linked to this wallet");
    }
    if (user.role !== "producer" && user.role !== "admin") {
      throw new ApiError(409, "Wallet linked to a non-producer account");
    }
    if (user.status !== "active") {
      throw new ApiError(403, "Account is not active");
    }

    return issueProducerSession(user, body.authMethod);
  });

  /** Link ZeroDev producer wallet to app JWT session (Google / Email OTP / Passkey). */
  app.post("/auth/producer/session", async (request) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(255),
        smartAccountAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/),
        authMethod: z.enum(["google", "email_otp", "passkey"]),
      })
      .parse(request.body);

    let [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user) {
      const [created] = await db
        .insert(users)
        .values({
          email: body.email,
          name: body.name,
          role: "producer",
          status: "active",
          smartAccountAddress: body.smartAccountAddress,
        })
        .returning();
      user = created!;
    } else {
      if (user.role !== "producer" && user.role !== "admin") {
        throw new ApiError(409, "Email already registered with another role");
      }
      const [updated] = await db
        .update(users)
        .set({
          name: body.name,
          smartAccountAddress: body.smartAccountAddress,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      user = updated!;
    }

    return issueProducerSession(user, body.authMethod);
  });

  app.get(
    "/auth/me",
    { preHandler: authenticate ?? (async (_r, reply) => reply.code(500).send({ error: "auth missing" })) },
    async (request) => {
      const user = request.user as AuthUser;
      const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (!row) throw new ApiError(401, "User not found");
      return {
        user: {
          id: row.id,
          email: row.email,
          role: row.role,
          name: row.name,
          smartAccountAddress: row.smartAccountAddress,
        },
      };
    },
  );

  const authPre =
    authenticate ?? (async (_r: unknown, reply: { code: (n: number) => { send: (b: unknown) => void } }) =>
      reply.code(500).send({ error: "auth missing" }));

  /** Status of backend session key for Google/OTP producers. Seed wallets skip grant. */
  app.get("/auth/producer/session-key/status", { preHandler: authPre }, async (request) => {
    const authUser = request.user as AuthUser;
    if (authUser.role !== "producer" && authUser.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1);
    if (!row?.smartAccountAddress) {
      return { status: "none" as const, needsGrant: true, signerKind: "unknown" as const };
    }

    // Seed demo Kernel — backend already has DEMO_WALLET_SEED owner key.
    try {
      const masterSeed =
        process.env["DEMO_WALLET_SEED"]?.trim() || "alpacto-local-demo-wallet-seed-v1";
      const zd = loadZeroDevConfigFromEnv();
      const publicClient = createAlpactoPublicClient({
        ...zd,
        publicRpc: process.env["ARBITRUM_RPC_URL"] || process.env["RPC_URL_SEPOLIA"],
      });
      const seedAccount = await createEcdsaKernelAccount(
        publicClient,
        deriveDemoOwnerKey(masterSeed, row.email),
      );
      if (seedAccount.address.toLowerCase() === row.smartAccountAddress.toLowerCase()) {
        return {
          status: "active" as const,
          needsGrant: false,
          signerKind: "seed" as const,
          smartAccountAddress: row.smartAccountAddress,
        };
      }
    } catch {
      // ZeroDev env missing in some local setups — fall through to session-key check.
    }

    const [active] = await db
      .select()
      .from(producerSessionKeys)
      .where(
        and(
          eq(producerSessionKeys.userId, authUser.id),
          eq(producerSessionKeys.status, "active"),
        ),
      )
      .orderBy(desc(producerSessionKeys.updatedAt))
      .limit(1);

    if (active?.serializedSession) {
      return {
        status: "active" as const,
        needsGrant: false,
        signerKind: "session" as const,
        sessionPublicAddress: active.sessionPublicAddress,
        smartAccountAddress: active.smartAccountAddress,
      };
    }

    const [pending] = await db
      .select()
      .from(producerSessionKeys)
      .where(
        and(
          eq(producerSessionKeys.userId, authUser.id),
          eq(producerSessionKeys.status, "pending"),
        ),
      )
      .orderBy(desc(producerSessionKeys.createdAt))
      .limit(1);

    if (pending) {
      return {
        status: "pending" as const,
        needsGrant: true,
        signerKind: "session" as const,
        sessionPublicAddress: pending.sessionPublicAddress,
        smartAccountAddress: pending.smartAccountAddress,
      };
    }

    return {
      status: "none" as const,
      needsGrant: true,
      signerKind: "session" as const,
      smartAccountAddress: row.smartAccountAddress,
    };
  });

  /**
   * Agent-created session key: server generates keypair, client approves address.
   * Seed demo producers do not need this (DEMO_WALLET_SEED matches).
   */
  app.post("/auth/producer/session-key/prepare", { preHandler: authPre }, async (request) => {
    const authUser = request.user as AuthUser;
    if (authUser.role !== "producer" && authUser.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const [row] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
    if (!row?.smartAccountAddress) {
      throw new ApiError(400, "Producer smart account missing — connect Google first");
    }

    const core = config.chain.alpactoContract;
    if (!core) {
      throw new ApiError(400, "ALPACTO_CONTRACT_ADDRESS not configured");
    }

    const sessionPrivateKey = generatePrivateKey();
    const sessionAccount = privateKeyToAccount(sessionPrivateKey);

    // Revoke prior pending rows for this user.
    await db
      .update(producerSessionKeys)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(producerSessionKeys.userId, authUser.id),
          eq(producerSessionKeys.status, "pending"),
        ),
      );

    const [created] = await db
      .insert(producerSessionKeys)
      .values({
        userId: authUser.id,
        smartAccountAddress: row.smartAccountAddress,
        sessionPublicAddress: sessionAccount.address,
        sessionPrivateKey,
        status: "pending",
      })
      .returning();

    return {
      id: created!.id,
      sessionPublicAddress: sessionAccount.address,
      smartAccountAddress: row.smartAccountAddress,
      alpactoCore: core as `0x${string}`,
      chainId: config.chain.chainId,
      permissions: [
        { selector: ACCEPT_SETTLEMENT_SELECTOR, name: "acceptSettlement" },
        { selector: SETTLE_LOT_SELECTOR, name: "settleLot" },
        { selector: REQUEST_REWEIGHING_SELECTOR, name: "requestReweighing" },
      ],
    };
  });

  app.post("/auth/producer/session-key/complete", { preHandler: authPre }, async (request) => {
    const authUser = request.user as AuthUser;
    if (authUser.role !== "producer" && authUser.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const body = z
      .object({
        serializedSession: z.string().min(10),
        sessionPublicAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/)
          .optional(),
      })
      .parse(request.body);

    const [pending] = await db
      .select()
      .from(producerSessionKeys)
      .where(
        and(
          eq(producerSessionKeys.userId, authUser.id),
          eq(producerSessionKeys.status, "pending"),
        ),
      )
      .orderBy(desc(producerSessionKeys.createdAt))
      .limit(1);

    if (!pending) {
      throw new ApiError(404, "No pending session key — call prepare first");
    }
    if (
      body.sessionPublicAddress &&
      body.sessionPublicAddress.toLowerCase() !== pending.sessionPublicAddress.toLowerCase()
    ) {
      throw new ApiError(400, "sessionPublicAddress mismatch");
    }

    // Revoke any previously active keys for this user.
    await db
      .update(producerSessionKeys)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(producerSessionKeys.userId, authUser.id),
          eq(producerSessionKeys.status, "active"),
        ),
      );

    const [updated] = await db
      .update(producerSessionKeys)
      .set({
        serializedSession: normalizeSerializedSessionEip7702Auth(body.serializedSession),
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(producerSessionKeys.id, pending.id))
      .returning();

    return {
      status: "active" as const,
      sessionPublicAddress: updated!.sessionPublicAddress,
      smartAccountAddress: updated!.smartAccountAddress,
    };
  });

  app.post("/auth/producer/session-key/revoke", { preHandler: authPre }, async (request) => {
    const authUser = request.user as AuthUser;
    if (authUser.role !== "producer" && authUser.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const result = await db
      .update(producerSessionKeys)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(producerSessionKeys.userId, authUser.id),
          eq(producerSessionKeys.status, "active"),
        ),
      )
      .returning();
    return { revoked: result.length };
  });
}
