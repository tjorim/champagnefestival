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
      className={cn("inline-block shrink-0 align-middle", className)}
      aria-hidden="true"
      focusable="false"
    />
  );
}
