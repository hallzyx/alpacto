"use client";

import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";

export default function DebugLayout({ children }: { children: React.ReactNode }) {
  return <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>;
}
