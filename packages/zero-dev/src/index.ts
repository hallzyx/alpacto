import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  toPermissionValidator,
  serializePermissionAccount,
  deserializePermissionAccount,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toCallPolicy, CallPolicyVersion } from "@zerodev/permissions/policies";
import { KERNEL_V3_1, KERNEL_V3_3, getEntryPoint } from "@zerodev/sdk/constants";
import {
  createPublicClient,
  fallback,
  http,
  keccak256,
  toBytes,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  encodeFunctionData,
  type Abi,
  toFunctionSelector,
} from "viem";
import {
  privateKeyToAccount,
  generatePrivateKey,
  type PrivateKeyAccount,
} from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

/** Public Arbitrum Sepolia RPC used when Alchemy/primary flaps. */
export const ARBITRUM_SEPOLIA_PUBLIC_RPC = "https://sepolia-rollup.arbitrum.io/rpc";

export function createPublicRpcTransport(primaryRpc?: string) {
  const primary = (primaryRpc ?? ARBITRUM_SEPOLIA_PUBLIC_RPC).trim();
  const urls =
    primary === ARBITRUM_SEPOLIA_PUBLIC_RPC
      ? [primary]
      : [primary, ARBITRUM_SEPOLIA_PUBLIC_RPC];
  return fallback(
    urls.map(url =>
      http(url, {
        timeout: 20_000,
        retryCount: 2,
        retryDelay: 400,
      }),
    ),
  );
}

function decodePermissionSessionJson(serializedSession: string): Record<string, unknown> {
  const jsonString = Buffer.from(serializedSession, "base64").toString("utf8");
  return JSON.parse(jsonString) as Record<string, unknown>;
}

function encodePermissionSessionJson(params: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(params), "utf8").toString("base64");
}

function toHexQuantity(value: unknown): Hex | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    if (value.startsWith("0x") || value.startsWith("0X")) return value as Hex;
    if (/^[0-9A-Fa-f]+$/.test(value)) return `0x${value}` as Hex;
    const n = Number(value);
    if (Number.isFinite(n)) return `0x${Math.trunc(n).toString(16)}` as Hex;
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `0x${Math.trunc(value).toString(16)}` as Hex;
  }
  if (typeof value === "bigint") {
    return `0x${value.toString(16)}` as Hex;
  }
  return undefined;
}

/**
 * ZeroDev paymaster rejects UserOps when eip7702Auth.v is a bare number / empty string
 * (expects /^0x[0-9A-Fa-f]*$/). Normalize or drop the field from serialized sessions.
 */
export function normalizeSerializedSessionEip7702Auth(serializedSession: string): string {
  try {
    const params = decodePermissionSessionJson(serializedSession);
    const auth = params["eip7702Auth"];
    if (!auth || typeof auth !== "object") return serializedSession;
    const next = { ...(auth as Record<string, unknown>) };
    if ("v" in next) {
      const hexV = toHexQuantity(next["v"]);
      if (hexV) next["v"] = hexV;
      else delete next["v"];
    }
    if ("yParity" in next && typeof next["yParity"] === "string") {
      const n = Number(next["yParity"]);
      if (Number.isFinite(n)) next["yParity"] = n;
    }
    params["eip7702Auth"] = next;
    return encodePermissionSessionJson(params);
  } catch {
    return serializedSession;
  }
}

/** If the SA is already EIP-7702 delegated, drop stale auth from the session blob. */
export async function stripEip7702AuthIfDelegated(
  publicClient: PublicClient<Transport, Chain>,
  serializedSession: string,
): Promise<string> {
  try {
    const params = decodePermissionSessionJson(serializedSession);
    if (!params["eip7702Auth"]) return serializedSession;
    const accountParams = params["accountParams"] as { accountAddress?: string } | undefined;
    const address = accountParams?.accountAddress as Address | undefined;
    if (!address) return serializedSession;
    const code = await publicClient.getCode({ address });
    if (code && code.length > 2 && code.toLowerCase().startsWith("0xef0100")) {
      delete params["eip7702Auth"];
      return encodePermissionSessionJson(params);
    }
    return serializedSession;
  } catch {
    return serializedSession;
  }
}

function shouldFallbackFromPaymaster(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("sponsoring policies") ||
    msg.includes("404") ||
    msg.includes("eip7702Auth") ||
    msg.includes("zd_sponsorUserOperation") ||
    msg.includes("Validation error") ||
    msg.includes("Status: 400") ||
    msg.includes("HTTP request failed")
  );
}

export const entryPoint = getEntryPoint("0.7");
/** Default for Ayni / seed ECDSA accounts created via @alpacto/zero-dev. */
export const kernelVersion = KERNEL_V3_1;
/** ZeroDev wallet-react Google/OTP Kernels use v3.3. */
export const producerWalletKernelVersion = KERNEL_V3_3;

export const SUBMIT_AUDIT_ATTESTATION_SELECTOR = toFunctionSelector(
  "submitAuditAttestation(uint256,uint32,bytes32,uint8)",
);

export const ACCEPT_SETTLEMENT_SELECTOR = toFunctionSelector(
  "acceptSettlement(uint256,uint32,bytes32,uint256,uint256,uint256,uint256)",
);

export const SETTLE_LOT_SELECTOR = toFunctionSelector("settleLot(uint256)");

export const REQUEST_REWEIGHING_SELECTOR = toFunctionSelector(
  "requestReweighing(uint256,bytes32)",
);

/** Call-policy permissions for producer session keys (Google/OTP automation). */
export function producerSessionPermissions(alpactoCore: Address) {
  return [
    { target: alpactoCore, selector: ACCEPT_SETTLEMENT_SELECTOR },
    { target: alpactoCore, selector: SETTLE_LOT_SELECTOR },
    { target: alpactoCore, selector: REQUEST_REWEIGHING_SELECTOR },
  ] as const;
}

export function buildProducerCallPolicy(alpactoCore: Address) {
  return toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [...producerSessionPermissions(alpactoCore)],
  });
}

export type ZeroDevConfig = {
  projectId: string;
  bundlerRpc: string;
  paymasterRpc?: string;
  chain?: Chain;
  publicRpc?: string;
};

export function getZeroDevRpc(config: ZeroDevConfig, chainId = 421614): string {
  const projectId = config.projectId;
  // Prefer explicit chain RPC; rewrite passkeys.* host (WebAuthn API, not bundler).
  const raw = config.bundlerRpc.trim();
  if (raw.includes("passkeys.zerodev.app") || !raw.includes("/chain/")) {
    return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
  }
  if (raw.startsWith("http")) {
    return raw;
  }
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}

export function getPaymasterRpc(config: ZeroDevConfig, chainId = 421614): string {
  const raw = (config.paymasterRpc || config.bundlerRpc).trim();
  if (raw.includes("passkeys.zerodev.app") || !raw.includes("/chain/")) {
    return getZeroDevRpc(config, chainId);
  }
  return raw.startsWith("http") ? raw : getZeroDevRpc(config, chainId);
}

export function createAlpactoPublicClient(config: ZeroDevConfig) {
  const chain = config.chain ?? arbitrumSepolia;
  return createPublicClient({
    chain,
    transport: createPublicRpcTransport(config.publicRpc ?? chain.rpcUrls.default.http[0]),
  });
}

export async function createEcdsaKernelAccount(
  publicClient: PublicClient,
  ownerKey: Hex,
  index = 0n,
) {
  const signer = privateKeyToAccount(ownerKey);
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });
  return createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
    index,
  });
}

export async function createSponsoredKernelClient(opts: {
  publicClient: PublicClient<Transport, Chain>;
  account: Awaited<ReturnType<typeof createKernelAccount>>;
  config: ZeroDevConfig;
  /** When false, UserOps pay their own gas (account must hold ETH). */
  usePaymaster?: boolean;
}) {
  const chain = opts.config.chain ?? arbitrumSepolia;
  const zerodevRpc = getZeroDevRpc(opts.config, chain.id);
  const usePaymaster = opts.usePaymaster !== false;

  if (!usePaymaster) {
    return createKernelAccountClient({
      account: opts.account,
      chain,
      bundlerTransport: http(zerodevRpc),
      client: opts.publicClient,
    });
  }

  const paymasterRpc = getPaymasterRpc(opts.config, chain.id);
  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(paymasterRpc),
  });

  return createKernelAccountClient({
    account: opts.account,
    chain,
    bundlerTransport: http(zerodevRpc),
    client: opts.publicClient,
    paymaster: {
      getPaymasterData: (userOperation) =>
        paymasterClient.sponsorUserOperation({ userOperation }),
    },
  });
}

export async function trySponsoredThenSelfFunded(opts: {
  publicClient: PublicClient<Transport, Chain>;
  account: Awaited<ReturnType<typeof createKernelAccount>>;
  config: ZeroDevConfig;
  fundEth?: (to: Address) => Promise<void>;
  to: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}) {
  try {
    const client = await createSponsoredKernelClient({
      publicClient: opts.publicClient,
      account: opts.account,
      config: opts.config,
      usePaymaster: true,
    });
    return await sendSponsoredCall({
      client,
      to: opts.to,
      abi: opts.abi,
      functionName: opts.functionName,
      args: opts.args,
    });
  } catch (err) {
    if (!shouldFallbackFromPaymaster(err)) {
      throw err;
    }
    console.warn(
      "⚠️  ZeroDev paymaster policy missing/rejected — funding SA with ETH and retrying without paymaster",
    );
    if (opts.fundEth) {
      await opts.fundEth(opts.account.address);
    }
    const client = await createSponsoredKernelClient({
      publicClient: opts.publicClient,
      account: opts.account,
      config: opts.config,
      usePaymaster: false,
    });
    return sendSponsoredCall({
      client,
      to: opts.to,
      abi: opts.abi,
      functionName: opts.functionName,
      args: opts.args,
    });
  }
}

export async function sendSponsoredCall(opts: {
  client: Awaited<ReturnType<typeof createSponsoredKernelClient>>;
  to: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}) {
  return sendSponsoredCalls({
    client: opts.client,
    calls: [
      {
        to: opts.to,
        abi: opts.abi,
        functionName: opts.functionName,
        args: opts.args,
      },
    ],
  });
}

export async function sendSponsoredCalls(opts: {
  client: Awaited<ReturnType<typeof createSponsoredKernelClient>>;
  calls: Array<{
    to: Address;
    data?: Hex;
    abi?: Abi;
    functionName?: string;
    args?: readonly unknown[];
    value?: bigint;
  }>;
}) {
  const encoded = opts.calls.map((c) => {
    const data =
      c.data ??
      encodeFunctionData({
        abi: c.abi!,
        functionName: c.functionName!,
        args: c.args as never,
      });
    return { to: c.to, data, value: c.value ?? 0n };
  });
  const userOpHash = await opts.client.sendUserOperation({
    callData: await opts.client.account.encodeCalls(encoded),
  });
  const receipt = await opts.client.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  return { userOpHash, receipt };
}

export async function trySponsoredThenSelfFundedBatch(opts: {
  publicClient: PublicClient<Transport, Chain>;
  account: Awaited<ReturnType<typeof createKernelAccount>>;
  config: ZeroDevConfig;
  fundEth?: (to: Address) => Promise<void>;
  calls: Array<{
    to: Address;
    data?: Hex;
    abi?: Abi;
    functionName?: string;
    args?: readonly unknown[];
    value?: bigint;
  }>;
}) {
  try {
    const client = await createSponsoredKernelClient({
      publicClient: opts.publicClient,
      account: opts.account,
      config: opts.config,
      usePaymaster: true,
    });
    return await sendSponsoredCalls({ client, calls: opts.calls });
  } catch (err) {
    if (!shouldFallbackFromPaymaster(err)) {
      throw err;
    }
    console.warn(
      "⚠️  ZeroDev paymaster policy missing/rejected — funding SA with ETH and retrying without paymaster",
    );
    if (opts.fundEth) {
      await opts.fundEth(opts.account.address);
    }
    const client = await createSponsoredKernelClient({
      publicClient: opts.publicClient,
      account: opts.account,
      config: opts.config,
      usePaymaster: false,
    });
    return sendSponsoredCalls({ client, calls: opts.calls });
  }
}

export function generateOwnerKey(): Hex {
  return generatePrivateKey();
}

/**
 * Deterministic ECDSA owner key for demo seed wallets (Arbitrum Sepolia).
 * Same DEMO_WALLET_SEED + email → same Kernel address across runs.
 */
export function deriveDemoOwnerKey(masterSeed: string, email: string): Hex {
  return keccak256(
    toBytes(`alpacto-demo-wallet-v1:${masterSeed}:${email.trim().toLowerCase()}`),
  );
}

export type AyniSessionSetup = {
  sessionPrivateKey: Hex;
  sessionAccount: PrivateKeyAccount;
  serializedSession: string;
  ayniSmartAccountAddress: Address;
  ayniOwnerKey: Hex;
};

/**
 * Ayni Kernel account + session key limited to submitAuditAttestation on AlpactoCore.
 */
export async function setupAyniSessionKey(opts: {
  publicClient: PublicClient<Transport, Chain>;
  config: ZeroDevConfig;
  ayniOwnerKey?: Hex;
  alpactoCore: Address;
}): Promise<AyniSessionSetup> {
  const ayniOwnerKey = opts.ayniOwnerKey ?? generatePrivateKey();
  const sudoValidator = await signerToEcdsaValidator(opts.publicClient, {
    signer: privateKeyToAccount(ayniOwnerKey),
    entryPoint,
    kernelVersion,
  });

  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const sessionSigner = await toECDSASigner({ signer: sessionAccount });

  const permissionPlugin = await toPermissionValidator(opts.publicClient, {
    entryPoint,
    kernelVersion,
    signer: sessionSigner,
    policies: [
      toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_4,
        permissions: [
          {
            target: opts.alpactoCore,
            selector: SUBMIT_AUDIT_ATTESTATION_SELECTOR,
          },
        ],
      }),
    ],
  });

  const account = await createKernelAccount(opts.publicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: sudoValidator,
      regular: permissionPlugin,
    },
  });

  const serializedSession = await serializePermissionAccount(
    account,
    sessionPrivateKey,
  );

  return {
    sessionPrivateKey,
    sessionAccount,
    serializedSession,
    ayniSmartAccountAddress: account.address,
    ayniOwnerKey,
  };
}

export async function createSessionKernelClient(opts: {
  publicClient: PublicClient<Transport, Chain>;
  config: ZeroDevConfig;
  serializedSession: string;
  sessionPrivateKey: Hex;
  usePaymaster?: boolean;
  /** Defaults to KERNEL_V3_1 (Ayni). Use producerWalletKernelVersion for Google SAs. */
  kernelVersion?: typeof KERNEL_V3_1 | typeof KERNEL_V3_3;
}) {
  const kv = opts.kernelVersion ?? kernelVersion;
  let serialized = normalizeSerializedSessionEip7702Auth(opts.serializedSession);
  serialized = await stripEip7702AuthIfDelegated(opts.publicClient, serialized);
  const account = await deserializePermissionAccount(
    opts.publicClient,
    entryPoint,
    kv,
    serialized,
    await toECDSASigner({
      signer: privateKeyToAccount(opts.sessionPrivateKey),
    }),
  );
  return createSponsoredKernelClient({
    publicClient: opts.publicClient,
    account,
    config: opts.config,
    usePaymaster: opts.usePaymaster !== false,
  });
}

/**
 * Send a call using a producer session key (Google/OTP), with paymaster → self-fund fallback.
 */
export async function trySessionSponsoredThenSelfFunded(opts: {
  publicClient: PublicClient<Transport, Chain>;
  config: ZeroDevConfig;
  serializedSession: string;
  sessionPrivateKey: Hex;
  fundEth?: (to: Address) => Promise<void>;
  to: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  /** Defaults to KERNEL_V3_1 (Ayni). Pass producerWalletKernelVersion for Google SAs. */
  kernelVersion?: typeof KERNEL_V3_1 | typeof KERNEL_V3_3;
}) {
  const kv = opts.kernelVersion ?? kernelVersion;
  try {
    const client = await createSessionKernelClient({
      publicClient: opts.publicClient,
      config: opts.config,
      serializedSession: opts.serializedSession,
      sessionPrivateKey: opts.sessionPrivateKey,
      usePaymaster: true,
      kernelVersion: kv,
    });
    return await sendSponsoredCall({
      client,
      to: opts.to,
      abi: opts.abi,
      functionName: opts.functionName,
      args: opts.args,
    });
  } catch (err) {
    if (!shouldFallbackFromPaymaster(err)) {
      throw err;
    }
    console.warn(
      "⚠️  ZeroDev paymaster rejected session UserOp — funding SA with ETH and retrying without paymaster",
    );
    let serialized = normalizeSerializedSessionEip7702Auth(opts.serializedSession);
    serialized = await stripEip7702AuthIfDelegated(opts.publicClient, serialized);
    const account = await deserializePermissionAccount(
      opts.publicClient,
      entryPoint,
      kv,
      serialized,
      await toECDSASigner({
        signer: privateKeyToAccount(opts.sessionPrivateKey),
      }),
    );
    if (opts.fundEth) {
      await opts.fundEth(account.address);
    }
    const client = await createSponsoredKernelClient({
      publicClient: opts.publicClient,
      account,
      config: opts.config,
      usePaymaster: false,
    });
    return sendSponsoredCall({
      client,
      to: opts.to,
      abi: opts.abi,
      functionName: opts.functionName,
      args: opts.args,
    });
  }
}

export async function trySessionSponsoredThenSelfFundedBatch(opts: {
  publicClient: PublicClient<Transport, Chain>;
  config: ZeroDevConfig;
  serializedSession: string;
  sessionPrivateKey: Hex;
  fundEth?: (to: Address) => Promise<void>;
  calls: Array<{
    to: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }>;
  kernelVersion?: typeof KERNEL_V3_1 | typeof KERNEL_V3_3;
}) {
  const kv = opts.kernelVersion ?? kernelVersion;
  try {
    const client = await createSessionKernelClient({
      publicClient: opts.publicClient,
      config: opts.config,
      serializedSession: opts.serializedSession,
      sessionPrivateKey: opts.sessionPrivateKey,
      usePaymaster: true,
      kernelVersion: kv,
    });
    return await sendSponsoredCalls({
      client,
      calls: opts.calls,
    });
  } catch (err) {
    if (!shouldFallbackFromPaymaster(err)) {
      throw err;
    }
    console.warn(
      "⚠️  ZeroDev paymaster rejected session batch — funding SA with ETH and retrying without paymaster",
    );
    let serialized = normalizeSerializedSessionEip7702Auth(opts.serializedSession);
    serialized = await stripEip7702AuthIfDelegated(opts.publicClient, serialized);
    const account = await deserializePermissionAccount(
      opts.publicClient,
      entryPoint,
      kv,
      serialized,
      await toECDSASigner({
        signer: privateKeyToAccount(opts.sessionPrivateKey),
      }),
    );
    if (opts.fundEth) {
      await opts.fundEth(account.address);
    }
    const client = await createSponsoredKernelClient({
      publicClient: opts.publicClient,
      account,
      config: opts.config,
      usePaymaster: false,
    });
    return sendSponsoredCalls({
      client,
      calls: opts.calls,
    });
  }
}

export function loadZeroDevConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ZeroDevConfig {
  const projectId = env["ZERODEV_PROJECT_ID"];
  const bundlerRpc = env["ZERODEV_BUNDLER_RPC"];
  if (!projectId || !bundlerRpc) {
    throw new Error("ZERODEV_PROJECT_ID and ZERODEV_BUNDLER_RPC are required");
  }
  return {
    projectId,
    bundlerRpc,
    paymasterRpc: env["ZERODEV_PAYMASTER_RPC"] || bundlerRpc,
    chain: arbitrumSepolia,
    publicRpc: env["ARBITRUM_RPC_URL"] || env["RPC_URL_SEPOLIA"],
  };
}

export {
  privateKeyToAccount,
  generatePrivateKey,
  arbitrumSepolia,
  toFunctionSelector,
  toPermissionValidator,
  serializePermissionAccount,
  toECDSASigner,
  toCallPolicy,
  CallPolicyVersion,
};
