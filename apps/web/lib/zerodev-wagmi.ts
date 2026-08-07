import { getZeroDevConnector, getZeroDevStore, getZeroDevWallet, zeroDevWallet } from "@zerodev/wallet-react";
import { disconnect, getAccount, type Config } from "@wagmi/core";
import { createConfig, http } from "wagmi";
import { arbitrumSepolia } from "viem/chains";

export const ZERODEV_PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID?.trim() ?? "";

export const isZeroDevConfigured = () => Boolean(ZERODEV_PROJECT_ID);

let zeroDevWagmiConfig: Config | null = null;

/** Wagmi config scoped to producer ZeroDev auth (Arbitrum Sepolia). */
export function getZeroDevWagmiConfig(): Config | null {
  if (!isZeroDevConfigured()) return null;
  if (!zeroDevWagmiConfig) {
    zeroDevWagmiConfig = createConfig({
      chains: [arbitrumSepolia],
      connectors: [
        zeroDevWallet({
          projectId: ZERODEV_PROJECT_ID,
          chains: [arbitrumSepolia],
        }),
      ],
      transports: {
        [arbitrumSepolia.id]: http(),
      },
      ssr: true,
    });
  }
  return zeroDevWagmiConfig;
}

/**
 * Clear the ZeroDev wagmi connector. Required on Alpacto logout — otherwise the
 * next Google click throws "Connector already connected" (@wagmi/core).
 */
export async function disconnectZeroDevWallet(config?: Config | null): Promise<void> {
  const cfg = config ?? getZeroDevWagmiConfig();
  if (!cfg) return;
  try {
    const account = getAccount(cfg);
    if (account.isConnected || account.connector) {
      await disconnect(cfg);
    }
  } catch {
    // Best-effort: Alpacto JWT is already cleared by caller.
  }
}

/** Kernel smart-account address when available; otherwise wagmi account. */
export async function resolveZeroDevSmartAccountAddress(config: Config): Promise<`0x${string}`> {
  const connector = getZeroDevConnector(config);
  const store = await getZeroDevStore(connector);
  const kernel = store.getState().kernelAccounts.get(arbitrumSepolia.id);
  if (kernel?.address) return kernel.address as `0x${string}`;

  const { address } = getAccount(config);
  if (address) return address as `0x${string}`;

  throw new Error("No se pudo obtener tu cuenta Alpacto");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function findEmailDeep(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return EMAIL_RE.test(trimmed) ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEmailDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = findEmailDeep(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function pickEmailFromAuthenticators(authenticators: {
  emailContacts?: Array<{ email?: string } | null> | null;
  oauths?: Array<Record<string, unknown> | null> | null;
}): string | null {
  const fromContact = authenticators.emailContacts?.find(
    c => typeof c?.email === "string" && c.email.includes("@"),
  )?.email;
  if (fromContact) return fromContact.trim().toLowerCase();

  // Google OAuth entries often omit a top-level email field; search nested payload.
  return findEmailDeep(authenticators.oauths) ?? findEmailDeep(authenticators.emailContacts);
}

/**
 * Email from ZeroDev authenticators after Google/OTP.
 * Docs: emailContacts[0].email — ZeroDev does **not** expose Google display name.
 * After logout→re-auth the stamped /authenticators call can lag; retry generously.
 * (`getAuthenticators` is not a public package export — call via wallet.client.)
 */
export async function fetchZeroDevEmailContact(config: Config): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const connector = getZeroDevConnector(config);
      const store = await getZeroDevStore(connector);
      const wallet = getZeroDevWallet(store);
      const { oauthConfig, session } = store.getState();
      if (!oauthConfig || !session) {
        await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }

      const authenticators = await wallet.client.getAuthenticators({
        subOrganizationId: session.organizationId,
        projectId: oauthConfig.projectId,
        token: session.token,
      });
      const email = pickEmailFromAuthenticators(authenticators);
      if (email) return email;
    } catch {
      // Stamp / session not ready yet — retry.
    }
    await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
  }
  return null;
}
