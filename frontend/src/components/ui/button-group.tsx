import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Labelled set of related buttons. Spacing is a flex gap rather than joined
 * borders; selection state belongs on each button (`aria-pressed`).
 */
function ButtonGroup({
  className,
  "aria-label": ariaLabel,
  ...props
}: Omit<ComponentProps<"div">, "aria-label" | "role"> & { "aria-label": string }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="button-group"
      className={cn("inline-flex flex-wrap gap-1", className)}
      {...props}
    />
  );
}

export { ButtonGroup };
