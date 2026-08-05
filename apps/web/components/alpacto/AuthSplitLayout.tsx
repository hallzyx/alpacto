import Image from "next/image";
import Link from "next/link";
import loginImage from "~~/assets/login_image.png";
import { cn } from "~~/lib/utils";

type AuthSplitLayoutProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Width of the left column content rail (brand + body share the same axis). */
  contentMaxWidth?: "sm" | "md";
};

const contentMaxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
} as const;

export function AuthSplitLayout({
  children,
  className,
  contentClassName,
  contentMaxWidth = "sm",
}: AuthSplitLayoutProps) {
  return (
    <div className={cn("grid min-h-svh lg:grid-cols-2", className)}>
      <div className="flex flex-col p-6 md:p-10">
        <div className={cn("mx-auto flex w-full flex-1 flex-col", contentMaxWidthClass[contentMaxWidth])}>
          <Link href="/" className="flex items-center gap-2 font-medium">
            <span
              aria-hidden
              className="size-3.5 shrink-0 rounded-[4px] bg-gradient-to-br from-[#1a6b6a] to-[#2a9d8f] shadow-[0_0_0_3px_rgba(42,157,143,0.18)]"
            />
            <span className="font-display text-xl font-semibold tracking-tight">Alpacto</span>
          </Link>
          <div className={cn("flex flex-1 flex-col justify-center py-8", contentClassName)}>
            <div className="w-full">{children}</div>
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src={loginImage}
          alt="Fibra de alpaca y el ecosistema Alpacto"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 0px"
          className="object-cover"
        />
      </div>
    </div>
  );
}
