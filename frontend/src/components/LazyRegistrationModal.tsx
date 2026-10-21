import { lazy, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import SuspenseWithBoundary from "@/components/SuspenseWithBoundary";
import type { RegistrationModalProps } from "@/components/RegistrationModal";
import { m } from "@/paraglide/messages";

// The form library and its fields are the biggest part of the home page's
// JavaScript, so they load on the first "register" click.
const RegistrationModal = lazy(() => import("@/components/RegistrationModal"));

/** RegistrationModal, downloaded when first shown and kept mounted after that,
 * so closing keeps its animation and form state. */
export default function LazyRegistrationModal(props: RegistrationModalProps) {
  const [requested, setRequested] = useState(props.show);
  if (props.show && !requested) setRequested(true);
  if (!requested) return null;

  return (
    <SuspenseWithBoundary
      fallback={
        <div className="fixed inset-0 z-dialog flex items-center justify-center bg-foreground/50">
          <Spinner label={m.loading()} variant="light" />
        </div>
      }
      errorFallback={
        <Alert
          variant="danger"
          className="fixed inset-x-4 bottom-4 z-dialog mb-0 text-center"
          onClose={() => {
            setRequested(false);
            props.onHide();
          }}
        >
          {m.error_loading_registration()}
        </Alert>
      }
    >
      <RegistrationModal {...props} />
    </SuspenseWithBoundary>
  );
}
