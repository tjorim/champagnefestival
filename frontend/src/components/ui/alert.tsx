import type { ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

type AlertVariant = "danger" | "warning" | "success" | "info" | "secondary" | "primary";

/**
 * Inline status message. Colours live on the stable `data-slot`/`data-variant`
 * hooks in `styles/tailwind.css`, so runtime themes retint alerts without
 * touching components.
 *
 * The default is an assertive live region (`role="alert"`), which e2e and
 * screen-reader flows rely on. Pass
 * `role="status"` for polite, non-urgent messages. The role already implies the
 * matching `aria-live`; do not add a second live region around an alert, which
 * announces the message twice.
 */
function Alert({
  className,
  variant = "info",
  role = "alert",
  onClose,
  closeLabel,
  children,
  ...props
}: ComponentProps<"div"> & {
  variant?: AlertVariant;
  /** Renders a dismiss button when provided. */
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      role={role}
      data-slot="alert"
      data-variant={variant}
      className={cn("relative mb-4 rounded-md px-4 py-3", onClose && "pe-12", className)}
      {...props}
    >
      {children}
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-2 end-2 text-current"
          aria-label={closeLabel ?? m.close()}
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function AlertHeading({
  className,
  as: Tag = "h4",
  ...props
}: ComponentProps<"h4"> & { as?: "h2" | "h3" | "h4" | "h5" | "h6" }) {
  return (
    <Tag
      data-slot="alert-heading"
      className={cn("mt-0 mb-2 text-base font-medium text-current", className)}
      {...props}
    />
  );
}

function AlertLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      data-slot="alert-link"
      className={cn("font-bold text-current underline", className)}
      {...props}
    />
  );
}

export { Alert, AlertHeading, AlertLink };
export type { AlertVariant };
