import { QRCodeSVG } from "qrcode.react";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Registration } from "@/types/registration";
import { fetchRegistration } from "@/lib/api/adminFetch";
import { queryKeys } from "@/lib/query/queryKeys";

interface RegistrationQrDialogProps {
  targetId: string | null;
  pageRegistrations: Registration[];
  registrationsById: Map<string, Registration>;
  onClose: () => void;
}

/** The check-in QR code of one booking, fetched fresh so a cancelled booking never shows a code. */
export function RegistrationQrDialog({
  targetId: qrTargetId,
  pageRegistrations,
  registrationsById,
  onClose,
}: RegistrationQrDialogProps) {
  const qrDetailQuery = useQuery({
    queryKey: [...queryKeys.admin.registrations, "qr", qrTargetId],
    queryFn: () => fetchRegistration(qrTargetId!),
    enabled: qrTargetId !== null,
    staleTime: 0,
  });
  const qrRegistration = qrTargetId
    ? (pageRegistrations.find((record) => record.id === qrTargetId) ??
      registrationsById.get(qrTargetId) ??
      null)
    : null;
  return (
    <Dialog
      open={qrTargetId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin>
        <DialogHeader>
          <DialogTitle>
            {m.admin_qr_code()} — {qrRegistration?.person.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-4 text-center">
          <p>{qrRegistration?.event?.title ?? qrRegistration?.event_id}</p>
          <p>{m.admin_qr_scan_info()}</p>
          {qrRegistration?.status === "cancelled" && (
            <Alert variant="warning">{m.admin_status_cancelled()}</Alert>
          )}
          {qrDetailQuery.isPending && <Spinner aria-label={m.admin_loading()} />}
          {qrDetailQuery.isError && (
            <Alert variant="danger">
              {apiErrorMessage(qrDetailQuery.error, m.admin_error_load_data())}
            </Alert>
          )}
          {qrDetailQuery.data?.status === "cancelled" && qrRegistration?.status !== "cancelled" && (
            <Alert variant="warning">{m.admin_status_cancelled()}</Alert>
          )}
          {!qrDetailQuery.isError &&
            qrDetailQuery.data?.check_in_token &&
            qrDetailQuery.data.status !== "cancelled" &&
            qrRegistration?.status !== "cancelled" && (
              <div className="inline-block rounded-md bg-white p-4">
                <QRCodeSVG
                  role="img"
                  aria-label={m.admin_qr_code()}
                  value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/check-in?id=${encodeURIComponent(qrDetailQuery.data.id)}#token=${encodeURIComponent(qrDetailQuery.data.check_in_token)}`}
                  size={180}
                  level="M"
                />
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
