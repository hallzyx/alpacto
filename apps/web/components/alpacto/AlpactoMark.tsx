import Image from "next/image";
import ayniWebIcon from "~~/assets/ayni_web_icon.webp";
import { cn } from "~~/lib/utils";

const sizeClass = {
  xs: "size-7",
  sm: "size-8",
  md: "size-16",
} as const;

type AlpactoMarkProps = {
  className?: string;
  size?: keyof typeof sizeClass;
  /** Light mark for dark backgrounds (e.g. footer). */
  onDark?: boolean;
};

export function AlpactoMark({ className, size = "xs", onDark = false }: AlpactoMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center self-center mb-1",
        sizeClass[size],
        className,
      )}
      aria-hidden
    >
      <Image
        src={ayniWebIcon}
        alt=""
        fill
        sizes={`${size === "md" ? "64px" : size === "sm" ? "32px" : "28px"}`}
        className={cn("object-contain object-center", onDark && "brightness-0 invert")}
      />
    </span>
  );
}
