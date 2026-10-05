import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const SPINNER_COLORS = {
  primary: "text-primary",
  secondary: "text-subtle",
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
  light: "text-inverse",
} as const;

/**
 * Indeterminate loading ring.
 *
 * - `label` makes it a stand-alone status: `role="status"` plus screen-reader-only
 *   text, announced once politely. Use it when nothing else says "loading".
 * - Without a label, role or children it is decorative (`aria-hidden`), for
 *   spinners that sit beside visible text or inside a control that already names
 *   its busy state, so the loading text is never announced twice.
 *
 * Honors `prefers-reduced-motion` by slowing the rotation rather than removing
 * the only progress cue.
 */
function Spinner({
  className,
  size = "default",
  variant,
  label,
  children,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  size?: "sm" | "default";
  variant?: keyof typeof SPINNER_COLORS;
  label?: string;
  children?: ComponentProps<"span">["children"];
}) {
  const decorative =
    !label && children == null && props.role == null && props["aria-label"] == null;
  return (
    <span
      data-slot="spinner"
      data-size={size}
      role={label ? "status" : undefined}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        "inline-block shrink-0 rounded-full border-current border-e-transparent align-middle animate-spin motion-reduce:animate-spinner-slow",
        size === "sm" ? "size-4 border-2" : "size-8 border-4",
        variant && SPINNER_COLORS[variant],
        className,
      )}
      {...props}
    >
      {label ? <span className="sr-only">{label}</span> : children}
    </span>
  );
}

export { Spinner };
