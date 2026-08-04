"use client";

import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";

export default function BlockExplorerLayout({ children }: { children: React.ReactNode }) {
  return <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>;
}
