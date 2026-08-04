import { getZeroDevConnector, getZeroDevStore, getZeroDevWallet, zeroDevWallet } from "@zerodev/wallet-react";
import { getAccount, type Config } from "@wagmi/core";
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

/** Kernel smart-account address when available; otherwise wagmi account. */
export async function resolveZeroDevSmartAccountAddress(config: Config): Promise<`0x${string}`> {
  const connector = getZeroDevConnector(config);
  const store = await getZeroDevStore(connector);
  const kernel = store.getState().kernelAccounts.get(arbitrumSepolia.id);
  if (kernel?.address) return kernel.address as `0x${string}`;

  const { address } = getAccount(config);
  if (address) return address as `0x${string}`;

  throw new Error("No se pudo obtener la cuenta ZeroDev");
}

/** Email from ZeroDev authenticators after Google/OTP (docs: emailContacts[0].email). */
export async function fetchZeroDevEmailContact(config: Config): Promise<string | null> {
  const connector = getZeroDevConnector(config);
  const store = await getZeroDevStore(connector);
  const wallet = getZeroDevWallet(store);
  const { oauthConfig, session } = store.getState();
  if (!oauthConfig || !session) return null;

  const authenticators = await wallet.client.getAuthenticators({
    subOrganizationId: session.organizationId,
    projectId: oauthConfig.projectId,
    token: session.token,
  });

  const email = authenticators.emailContacts?.[0]?.email;
  return typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null;
}
