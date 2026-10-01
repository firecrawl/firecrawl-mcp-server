import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Keep third-party artwork on a fixed light surface without changing its brand colors. */
export function ProviderLogo({ className, alt = "", ...props }: ComponentProps<"img">) {
  return (
    <img
      {...props}
      alt={alt}
      className={cn("bg-[#fff] object-contain [color-scheme:light]", className)}
    />
  );
}
