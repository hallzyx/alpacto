import { ZeroDevProvider } from "~~/components/alpacto/ZeroDevProvider";

/** ZeroDev wagmi scope so Google/OTP producers can grant session keys after login. */
export default function ProducerLayout({ children }: { children: React.ReactNode }) {
  return <ZeroDevProvider>{children}</ZeroDevProvider>;
}
