import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "dark"
  | "outline";

const BADGE_VARIANTS: readonly BadgeVariant[] = [
  "primary",
  "secondary",
  "success",
  "danger",
  "warning",
  "info",
  "dark",
  "outline",
];

/** Narrows a dynamic tone string (e.g. a status mapper result) to a variant. */
function toBadgeVariant(value: string, fallback: BadgeVariant = "secondary"): BadgeVariant {
  return (BADGE_VARIANTS as readonly string[]).includes(value) ? (value as BadgeVariant) : fallback;
}

/**
 * Small label. Colour is never the only carrier of meaning: every badge needs
 * visible text (or an `sr-only` child for icon-only content). Colours live on
 * `data-slot`/`data-variant` in `styles/tailwind.css` (not as important
 * utilities), so runtime themes retint them per variant and may change the
 * shape, weight and case. Size comes from there too, which lets a caller's
 * `tw:text-micro`/`tw:text-tiny` win.
 */
function Badge({
  className,
  variant = "secondary",
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      data-tailwind-migrated="true"
      className={cn(
        "tw:inline-block tw:px-2 tw:py-1 tw:leading-none tw:whitespace-nowrap tw:align-baseline",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, toBadgeVariant };
export type { BadgeVariant };
