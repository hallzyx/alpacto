import { buildPageMetadata } from "~~/lib/metadata";

export const metadata = buildPageMetadata({
  path: "/",
});

export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return <div className="alpacto-product min-h-svh">{children}</div>;
}
