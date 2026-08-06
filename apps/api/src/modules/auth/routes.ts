import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
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
  users,
  type Database,
} from "@alpacto/database";
import {
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  generateOwnerKey,
  loadZeroDevConfigFromEnv,
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
          sessionPublicAddress: z.string().optional(),
          smartAccountAddress: z.string().optional(),
        })
        .parse(request.body ?? {});

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

    // Demo: auto-join Asociación AlpaSur so association can assign this producer on lots.
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
      authMethod: body.authMethod,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        smartAccountAddress: user.smartAccountAddress,
      },
    };
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
}
