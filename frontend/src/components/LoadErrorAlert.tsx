import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";

/**
 * A failed read with a manual Retry, so a temporary outage never needs a full-page reload.
 * `retrying` keeps the alert (and the data around it) on screen while the retry is in flight.
 */
export function LoadErrorAlert({
  children,
  onRetry,
  retrying = false,
}: {
  children: ReactNode;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Alert variant="danger" className="flex flex-wrap items-center justify-between gap-3">
      <span>{children}</span>
      <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
        {retrying && <Spinner size="sm" className="me-2" aria-hidden="true" />}
        {m.admin_retry()}
      </Button>
    </Alert>
  );
}
