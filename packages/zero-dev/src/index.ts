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
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import {
  createPublicClient,
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

export const entryPoint = getEntryPoint("0.7");
export const kernelVersion = KERNEL_V3_1;

export const SUBMIT_AUDIT_ATTESTATION_SELECTOR = toFunctionSelector(
  "submitAuditAttestation(uint256,uint32,bytes32,uint8)",
);

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
    transport: http(config.publicRpc ?? chain.rpcUrls.default.http[0]),
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
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("sponsoring policies") && !msg.includes("404")) {
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
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("sponsoring policies") && !msg.includes("404")) {
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
}) {
  const account = await deserializePermissionAccount(
    opts.publicClient,
    entryPoint,
    kernelVersion,
    opts.serializedSession,
    await toECDSASigner({
      signer: privateKeyToAccount(opts.sessionPrivateKey),
    }),
  );
  return createSponsoredKernelClient({
    publicClient: opts.publicClient,
    account,
    config: opts.config,
  });
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
};
