import { ZeroDevProvider } from "~~/components/alpacto/ZeroDevProvider";

export default function ProducerAuthLayout({ children }: { children: React.ReactNode }) {
  return <ZeroDevProvider>{children}</ZeroDevProvider>;
}
