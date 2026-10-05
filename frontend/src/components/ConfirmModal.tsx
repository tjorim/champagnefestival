import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ArchiveIcon, TriangleAlertIcon, TrashIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { m } from "@/paraglide/messages";

interface ConfirmModalProps {
  show: boolean;
  admin?: boolean;
  title: ReactNode;
  body: ReactNode;
  onConfirm: () => Promise<void>;
  onHide: () => void;
  confirmLabel?: ReactNode;
  variant?: "danger" | "warning" | "primary";
  icon?: string;
  errorFallback: string;
}

/**
 * Themed replacement for `window.confirm()` destructive-action dialogs.
 *
 * Manages its own pending/error state around the async `onConfirm`: the
 * confirm button shows a spinner while it runs, a failure is shown inline
 * and keeps the dialog open, and a success calls `onHide`.
 */
export default function ConfirmModal({
  show,
  admin = false,
  title,
  body,
  onConfirm,
  onHide,
  confirmLabel,
  variant = "danger",
  icon = "trash",
  errorFallback,
}: ConfirmModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismiss = () => {
    if (!pending) onHide();
  };
  const Icon =
    icon === "archive"
      ? ArchiveIcon
      : icon === "exclamation-triangle"
        ? TriangleAlertIcon
        : TrashIcon;

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorFallback);
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={show}
      onOpenChange={(open, details) => {
        if (!open) {
          if (pending) details.cancel();
          else onHide();
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open) setError(null);
      }}
    >
      <AlertDialogContent admin={admin} onBackdropClick={dismiss}>
        <AlertDialogHeader>
          <AlertDialogTitle className="pr-8">{title}</AlertDialogTitle>
          <AlertDialogCancel
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            className="absolute top-4 right-4"
            aria-label={m.close()}
          >
            <XIcon />
          </AlertDialogCancel>
          <AlertDialogDescription render={<div />}>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{m.admin_action_cancel()}</AlertDialogCancel>
          <Button
            variant={
              variant === "danger" ? "destructive" : variant === "warning" ? "warning" : "default"
            }
            onClick={() => void handleConfirm()}
            disabled={pending}
          >
            {pending ? (
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="size-4" aria-hidden="true" />
            )}
            {confirmLabel ?? m.admin_action_confirm()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
