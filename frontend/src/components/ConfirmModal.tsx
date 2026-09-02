import { useState } from "react";
import type { ReactNode } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";

interface ConfirmModalProps {
  show: boolean;
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

  const handleConfirm = async () => {
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
    <Modal
      show={show}
      onHide={() => {
        if (!pending) onHide();
      }}
      onExited={() => setError(null)}
      centered
    >
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="fs-6 text-warning">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        {error && (
          <Alert variant="danger" aria-live="assertive" className="py-2 small">
            {error}
          </Alert>
        )}
        {body}
      </Modal.Body>
      <Modal.Footer className="bg-dark border-secondary">
        <Button variant="outline-secondary" onClick={onHide} disabled={pending}>
          {m.admin_action_cancel()}
        </Button>
        <Button variant={variant} onClick={() => void handleConfirm()} disabled={pending}>
          {pending ? (
            <Spinner as="span" animation="border" size="sm" className="me-1" aria-hidden="true" />
          ) : (
            <i className={`bi bi-${icon} me-1`} aria-hidden="true" />
          )}
          {confirmLabel ?? m.admin_action_confirm()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
