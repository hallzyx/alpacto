import { and, desc, eq } from "drizzle-orm";
import { producerSessionKeys, type Database } from "@alpacto/database";
import {
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  deriveDemoOwnerKey,
  loadZeroDevConfigFromEnv,
  producerWalletKernelVersion,
  trySessionSponsoredThenSelfFunded,
  trySessionSponsoredThenSelfFundedBatch,
  trySponsoredThenSelfFunded,
  trySponsoredThenSelfFundedBatch,
  type ZeroDevConfig,
} from "@alpacto/zero-dev";
import type { Abi, Address, Hex, PublicClient, Transport, Chain } from "viem";
import { ApiError } from "./errors.js";

export class ProducerSessionRequiredError extends Error {
  code = "PRODUCER_SESSION_REQUIRED" as const;
  constructor(message = "Producer must grant an Alpacto session key (Google/OTP wallet)") {
    super(message);
    this.name = "ProducerSessionRequiredError";
  }
}

function resolveDemoOwnerKey(email: string): Hex {
  const masterSeed =
    process.env["DEMO_WALLET_SEED"]?.trim() || "alpacto-local-demo-wallet-seed-v1";
  return deriveDemoOwnerKey(masterSeed, email);
}

export type ProducerUser = {
  id: string;
  email: string;
  smartAccountAddress: string;
};

export type ResolvedProducerSigner =
  | {
      kind: "seed";
      address: Address;
      zd: ZeroDevConfig;
      publicClient: PublicClient<Transport, Chain>;
      account: Awaited<ReturnType<typeof createEcdsaKernelAccount>>;
    }
  | {
      kind: "session";
      address: Address;
      zd: ZeroDevConfig;
      publicClient: PublicClient<Transport, Chain>;
      serializedSession: string;
      sessionPrivateKey: Hex;
    };

/**
 * Seed demo wallet if address matches DEMO_WALLET_SEED derivation;
 * otherwise active producer_session_keys row (Google/OTP).
 */
export async function resolveProducerSigner(
  db: Database,
  producer: ProducerUser,
): Promise<ResolvedProducerSigner> {
  if (!producer.smartAccountAddress || !producer.email) {
    throw new Error("Producer smart account / email missing");
  }

  const expected = producer.smartAccountAddress as Address;
  const zd = loadZeroDevConfigFromEnv();
  const publicClient = createAlpactoPublicClient({
    ...zd,
    publicRpc: process.env["ARBITRUM_RPC_URL"] || process.env["RPC_URL_SEPOLIA"],
  });

  const ownerKey = resolveDemoOwnerKey(producer.email);
  const seedAccount = await createEcdsaKernelAccount(publicClient, ownerKey);
  if (seedAccount.address.toLowerCase() === expected.toLowerCase()) {
    return {
      kind: "seed",
      address: seedAccount.address,
      zd,
      publicClient,
      account: seedAccount,
    };
  }

  const [session] = await db
    .select()
    .from(producerSessionKeys)
    .where(
      and(
        eq(producerSessionKeys.userId, producer.id),
        eq(producerSessionKeys.status, "active"),
      ),
    )
    .orderBy(desc(producerSessionKeys.updatedAt))
    .limit(1);

  if (
    !session?.serializedSession ||
    !session.sessionPrivateKey ||
    session.smartAccountAddress.toLowerCase() !== expected.toLowerCase()
  ) {
    throw new ProducerSessionRequiredError();
  }

  return {
    kind: "session",
    address: expected,
    zd,
    publicClient,
    serializedSession: session.serializedSession,
    sessionPrivateKey: (session.sessionPrivateKey.startsWith("0x")
      ? session.sessionPrivateKey
      : `0x${session.sessionPrivateKey}`) as Hex,
  };
}

export function producerSessionRequiredToApiError(err: unknown): ApiError | null {
  if (err instanceof ProducerSessionRequiredError) {
    return new ApiError(409, err.message, err.code);
  }
  return null;
}

export async function sendProducerCall(opts: {
  signer: ResolvedProducerSigner;
  fundEth?: (to: Address) => Promise<void>;
  to: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}) {
  if (opts.signer.kind === "seed") {
    return trySponsoredThenSelfFunded({
      publicClient: opts.signer.publicClient,
      account: opts.signer.account,
      config: opts.signer.zd,
      fundEth: opts.fundEth,
      to: opts.to,
      abi: opts.abi,
      functionName: opts.functionName,
      args: opts.args,
    });
  }
  return trySessionSponsoredThenSelfFunded({
    publicClient: opts.signer.publicClient,
    config: opts.signer.zd,
    serializedSession: opts.signer.serializedSession,
    sessionPrivateKey: opts.signer.sessionPrivateKey,
    fundEth: opts.fundEth,
    to: opts.to,
    abi: opts.abi,
    functionName: opts.functionName,
    args: opts.args,
    kernelVersion: producerWalletKernelVersion,
  });
}

export async function sendProducerBatch(opts: {
  signer: ResolvedProducerSigner;
  fundEth?: (to: Address) => Promise<void>;
  calls: Array<{
    to: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }>;
}) {
  if (opts.signer.kind === "seed") {
    return trySponsoredThenSelfFundedBatch({
      publicClient: opts.signer.publicClient,
      account: opts.signer.account,
      config: opts.signer.zd,
      fundEth: opts.fundEth,
      calls: opts.calls,
    });
  }
  return trySessionSponsoredThenSelfFundedBatch({
    publicClient: opts.signer.publicClient,
    config: opts.signer.zd,
    serializedSession: opts.signer.serializedSession,
    sessionPrivateKey: opts.signer.sessionPrivateKey,
    fundEth: opts.fundEth,
    calls: opts.calls,
    kernelVersion: producerWalletKernelVersion,
  });
}
