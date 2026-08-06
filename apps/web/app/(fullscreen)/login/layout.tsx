import { buildPageMetadata } from "~~/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Iniciar sesión",
  description:
    "Accede a Alpacto como comprador, asociación, inspector o administrador. Comercio justo de fibra con fondos asegurados y evidencia verificable.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
