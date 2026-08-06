import { ZeroDevProvider } from "~~/components/alpacto/ZeroDevProvider";
import { buildPageMetadata } from "~~/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Soy productor",
  description:
    "Crea tu cuenta de productor en Alpacto con Google, correo o passkey. Revisa y acepta tu liquidación en soles antes de entregar tu fibra.",
  path: "/auth/producer",
});

export default function ProducerAuthLayout({ children }: { children: React.ReactNode }) {
  return <ZeroDevProvider>{children}</ZeroDevProvider>;
}
