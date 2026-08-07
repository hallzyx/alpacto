import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { serializePermissionAccount, toPermissionValidator } from "@zerodev/permissions";
import { toCallPolicy, CallPolicyVersion } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { addressToEmptyAccount, createKernelAccount } from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { getZeroDevConnector, getZeroDevStore } from "@zerodev/wallet-react";
import { createPublicClient, http, toFunctionSelector, type Address, type Hex } from "viem";
import { arbitrumSepolia } from "viem/chains";
import type { Config } from "wagmi";
import { apiFetch } from "~~/lib/api";
import { getZeroDevWagmiConfig, isZeroDevConfigured } from "~~/lib/zerodev-wagmi";

const entryPoint = getEntryPoint("0.7");
/** Matches @zerodev/wallet-react Kernel version. */
const kernelVersion = KERNEL_V3_3;

const ACCEPT_SETTLEMENT_SELECTOR = toFunctionSelector(
  "acceptSettlement(uint256,uint32,bytes32,uint256,uint256,uint256,uint256)",
);
const SETTLE_LOT_SELECTOR = toFunctionSelector("settleLot(uint256)");
const REQUEST_REWEIGHING_SELECTOR = toFunctionSelector("requestReweighing(uint256,bytes32)");

export type ProducerSessionKeyStatus = {
  status: "none" | "pending" | "active";
  needsGrant: boolean;
  signerKind?: "seed" | "session" | "unknown";
  sessionPublicAddress?: string;
  smartAccountAddress?: string;
};

export type PrepareSessionKeyResponse = {
  id: string;
  sessionPublicAddress: Address;
  smartAccountAddress: Address;
  alpactoCore: Address;
  chainId: number;
  permissions: Array<{ selector: Hex; name: string }>;
};

export async function fetchProducerSessionKeyStatus(): Promise<ProducerSessionKeyStatus> {
  return apiFetch<ProducerSessionKeyStatus>("/auth/producer/session-key/status");
}

/**
 * Agent-created session key grant (ZeroDev transaction automation):
 * prepare → owner signs empty-account approval → complete.
 */
export async function grantProducerSessionKey(wagmiConfig?: Config | null): Promise<{
  sessionPublicAddress: string;
  smartAccountAddress: string;
}> {
  if (!isZeroDevConfigured()) {
    throw new Error("El inicio de sesión con Google no está disponible. Contacta a soporte.");
  }

  const cfg = wagmiConfig ?? getZeroDevWagmiConfig();
  if (!cfg) throw new Error("No se pudo conectar tu cuenta. Vuelve a iniciar sesión con Google.");

  const prepare = await apiFetch<PrepareSessionKeyResponse>("/auth/producer/session-key/prepare", {
    method: "POST",
    body: {},
  });

  const connector = getZeroDevConnector(cfg);
  const store = await getZeroDevStore(connector);
  const state = store.getState();
  const eoaAccount = state.eoaAccount;
  if (!eoaAccount) {
    throw new Error("Conecta Google/OTP de nuevo para firmar la autorización");
  }

  const chainId = prepare.chainId || arbitrumSepolia.id;
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const emptyAccount = addressToEmptyAccount(prepare.sessionPublicAddress);
  const emptySessionKeySigner = await toECDSASigner({ signer: emptyAccount });

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    kernelVersion,
    signer: emptySessionKeySigner,
    policies: [
      toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_4,
        permissions: [
          { target: prepare.alpactoCore, selector: ACCEPT_SETTLEMENT_SELECTOR },
          { target: prepare.alpactoCore, selector: SETTLE_LOT_SELECTOR },
          { target: prepare.alpactoCore, selector: REQUEST_REWEIGHING_SELECTOR },
        ],
      }),
    ],
  });

  const kernel = state.kernelAccounts.get(chainId);
  const use7702 = Boolean(kernel?.address) && kernel!.address.toLowerCase() === eoaAccount.address.toLowerCase();

  const sessionKeyAccount = use7702
    ? await createKernelAccount(publicClient, {
        entryPoint,
        kernelVersion,
        eip7702Account: eoaAccount,
        plugins: { regular: permissionPlugin },
      })
    : await createKernelAccount(publicClient, {
        entryPoint,
        kernelVersion,
        plugins: {
          sudo: await signerToEcdsaValidator(publicClient, {
            signer: eoaAccount,
            entryPoint,
            kernelVersion,
          }),
          regular: permissionPlugin,
        },
      });

  if (sessionKeyAccount.address.toLowerCase() !== prepare.smartAccountAddress.toLowerCase()) {
    throw new Error("Tu cuenta de pago no coincide con tu cuenta Alpacto. Vuelve a iniciar sesión con Google.");
  }

  // Owner enable-signature is captured here; first agent UserOp installs the plugin.
  const serializedSession = await serializePermissionAccount(sessionKeyAccount);

  return apiFetch("/auth/producer/session-key/complete", {
    method: "POST",
    body: {
      serializedSession,
      sessionPublicAddress: prepare.sessionPublicAddress,
    },
  });
}

export function isProducerSessionRequired(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ("code" in err && (err as { code: unknown }).code === "PRODUCER_SESSION_REQUIRED") {
    return true;
  }
  const body = "body" in err ? (err as { body: unknown }).body : null;
  if (body && typeof body === "object" && body !== null && "code" in body) {
    return (body as { code: unknown }).code === "PRODUCER_SESSION_REQUIRED";
  }
  return false;
}

/**
 * First Google/OTP login only: configure the on-chain session key while the ZeroDev wallet
 * is still connected. Skips if already active (seed producers or returning users).
 * Failures are silent — the dashboard banner is the fallback.
 */
export async function maybeGrantProducerSessionKey(wagmiConfig?: Config | null): Promise<boolean> {
  try {
    const status = await fetchProducerSessionKeyStatus();
    if (!status.needsGrant || status.signerKind === "seed" || status.status === "active") {
      return true;
    }
    await grantProducerSessionKey(wagmiConfig);
    return true;
  } catch {
    return false;
  }
}
