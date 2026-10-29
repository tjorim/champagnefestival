import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/**
 * Row actions of an admin list (pattern guide: `docs/frontend-ui.md`, "Admin
 * action patterns"). Everyday actions come first; the destructive one is last
 * and set apart by a divider so it is not next to Edit. Wrapping on narrow
 * screens keeps the divider and delete together.
 */
export function RowActions({
  children,
  destructive,
  className,
}: {
  children?: ReactNode;
  /** The delete action, rendered last and set apart from the rest. */
  destructive?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {children}
      {destructive && (
        <span className="flex items-center gap-1">
          {children && <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />}
          {destructive}
        </span>
      )}
    </div>
  );
}

type RowActionButtonProps = Omit<ComponentProps<typeof Button>, "aria-label" | "title"> & {
  icon: LucideIcon;
  /** Names the action and the row ("Edit March 2027"); used as tooltip and accessible name. */
  label: string;
  destructive?: boolean;
};

/** Icon-only row action: tooltip and accessible name come from `label`. */
export function RowActionButton({
  icon,
  label,
  destructive = false,
  variant,
  size = "sm",
  ...props
}: RowActionButtonProps) {
  return (
    <Button
      type="button"
      size={size}
      variant={variant ?? (destructive ? "outline-danger" : "outline")}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon icon={icon} />
    </Button>
  );
}

/**
 * The primary "Add …" action of a section: outlined, small, with a plus icon and
 * a label of the form "Add <thing>" (never "New <thing>").
 */
export function AdminAddButton({
  children,
  variant = "outline-primary",
  size = "sm",
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant={variant} size={size} {...props}>
      <Icon icon={PlusIcon} />
      {children}
    </Button>
  );
}
