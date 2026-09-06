import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import ConfirmModal from "@/components/ConfirmModal";

interface ConfirmRequest {
  title: ReactNode;
  body: ReactNode;
  errorFallback: string;
  confirmLabel?: ReactNode;
  variant?: "danger" | "warning" | "primary";
  icon?: string;
}

/**
 * Promise-based wrapper around `ConfirmModal`, for flows that have to ask
 * mid-`await` — where the usual "render the modal from a confirm-target
 * state" pattern can't be used because the answer is needed inline, part-way
 * through an async handler (see `useAdminRegistrationActions`'s over-capacity
 * retry, which asks only after a write has already come back rejected).
 *
 * Exists so those call sites don't fall back to `window.confirm`, which
 * browsers let the user suppress after repeated use — after which it returns
 * `false` silently and the action appears to do nothing (#935).
 *
 * The caller renders `confirmDialog` and awaits `confirm(...)`, which resolves
 * `true` on confirm and `false` on cancel, dismiss, or supersede.
 */
export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    // Nulling the ref first makes this idempotent: ConfirmModal calls its own
    // onHide after a successful onConfirm, which would otherwise resolve a
    // second time with `false`.
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback(
    (next: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        // A second request while one is open cancels the first rather than
        // stranding its caller on a promise that never settles.
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setRequest(next);
      }),
    [],
  );

  // Settles any outstanding promise if the component using this hook unmounts
  // while a dialog is open (e.g. the admin navigates away mid-confirmation),
  // so `await confirm(...)` can't hang forever with the dialog it was waiting
  // on already gone.
  useEffect(
    () => () => {
      resolveRef.current?.(false);
      resolveRef.current = null;
    },
    [],
  );

  const confirmDialog = request ? (
    <ConfirmModal
      show
      title={request.title}
      body={request.body}
      errorFallback={request.errorFallback}
      confirmLabel={request.confirmLabel}
      variant={request.variant}
      icon={request.icon}
      onConfirm={() => {
        settle(true);
        return Promise.resolve();
      }}
      onHide={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
