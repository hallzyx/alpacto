import { AppShell } from "~~/components/alpacto/AppShell";
import { buildPageMetadata } from "~~/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Panel",
  description: "Panel privado de Alpacto.",
  noIndex: true,
});

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
