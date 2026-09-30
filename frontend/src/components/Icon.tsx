import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

interface IconProps extends Omit<LucideProps, "ref" | "aria-hidden" | "role" | "tabIndex"> {
  icon: LucideIcon;
}

/** Decorative SVG; the surrounding control supplies its accessible name. */
export function Icon({ icon: SvgIcon, className, size = "1em", ...props }: IconProps) {
  return (
    <SvgIcon
      {...props}
      size={size}
      className={cn("tw:inline-block tw:shrink-0 tw:align-middle", className)}
      data-tailwind-migrated="true"
      aria-hidden="true"
      focusable="false"
    />
  );
}
