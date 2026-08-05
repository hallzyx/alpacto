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

/** Oblique left edge on the image panel (desktop). */
const IMAGE_PANEL_CLIP = "polygon(18.75% 0, 100% 0, 100% 100%, 0 100%)";

export function AuthSplitLayout({
  children,
  className,
  contentClassName,
  contentMaxWidth = "sm",
}: AuthSplitLayoutProps) {
  return (
    <div className={cn("relative min-h-svh overflow-x-hidden", className)}>
      {/* Right visual panel — oblique seam instead of a straight 50/50 cut */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[50%] lg:block">
        <div className="absolute inset-0 bg-muted" style={{ clipPath: IMAGE_PANEL_CLIP }}>
          <Image src={loginImage} alt="" fill priority sizes="(min-width: 1024px) 50vw, 0px" className="object-cover" />
          <div
            className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent"
            style={{ clipPath: IMAGE_PANEL_CLIP }}
          />
        </div>
      </div>

      {/* Form column — overlaps slightly under the oblique cut */}
      <div className="relative z-10 flex min-h-svh flex-col p-6 md:p-10 lg:w-[60%]">
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
    </div>
  );
}
