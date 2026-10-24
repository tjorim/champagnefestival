import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { emailConsentErrorMessage } from "@/utils/emailConsentErrors";
import {
  emailConsentKeys,
  emailRequest,
  revokedSourceLabel,
  sourceLabel,
  type EmailConsentRecord,
} from "@/utils/emailCategories";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ConfirmModal from "@/components/ConfirmModal";

/**
 * A person's email consent history (#1408): read-only, plus recording an opt-out. Consent can only
 * be given by the person themselves (their account preferences or the emailed confirmation link),
 * so there is deliberately no way to grant it here.
 */
export default function PersonEmailConsents({
  person,
  authHeaders,
  onClose,
}: {
  person: { id: string; name: string };
  authHeaders: () => Record<string, string>;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const queryKey = emailConsentKeys.person(person.id);
  const consents = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      emailRequest<EmailConsentRecord[]>(
        `/api/people/${encodeURIComponent(person.id)}/email-consents`,
        authHeaders,
        m.admin_email_consents_error(),
        signal,
      ),
  });
  const [optOut, setOptOut] = useState<EmailConsentRecord | null>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !optOut) onClose();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>{m.admin_email_consents_title({ name: person.name })}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-subtle">{m.admin_email_consents_note()}</p>
          {consents.isPending && <p role="status">{m.admin_loading()}</p>}
          {consents.isError && (
            <Alert variant="danger">
              {emailConsentErrorMessage(consents.error, m.admin_email_consents_error())}
              <Button variant="outline" onClick={() => void consents.refetch()}>
                {m.admin_retry()}
              </Button>
            </Alert>
          )}
          {consents.data?.length === 0 && <p>{m.admin_email_consents_none()}</p>}
          <div className="flex flex-col gap-4">
            {consents.data?.map((consent) => (
              <section className="rounded border border-border p-4" key={consent.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="mb-0">{consent.category_name}</h3>
                  <Badge variant={consent.revoked_at ? "secondary" : "success"}>
                    {consent.revoked_at
                      ? m.admin_email_consent_withdrawn()
                      : m.admin_email_consent_active()}
                  </Badge>
                </div>
                <p className="text-sm mb-0">
                  {m.admin_email_consent_given({
                    date: new Date(consent.granted_at).toLocaleDateString(),
                    source: sourceLabel(consent.source),
                  })}
                </p>
                {consent.revoked_at && consent.revoked_source && (
                  <p className="text-sm mb-0">
                    {m.admin_email_consent_ended({
                      date: new Date(consent.revoked_at).toLocaleDateString(),
                      source: revokedSourceLabel(consent.revoked_source),
                    })}
                  </p>
                )}
                {!consent.revoked_at && (
                  <Button className="mt-2" variant="outline" onClick={() => setOptOut(consent)}>
                    {m.admin_email_consent_opt_out()}
                  </Button>
                )}
              </section>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
      {optOut && (
        <ConfirmModal
          show
          admin
          variant="primary"
          icon="exclamation-triangle"
          title={m.admin_email_consent_opt_out()}
          body={m.admin_email_consent_opt_out_confirm({
            category: optOut.category_name,
            name: person.name,
          })}
          confirmLabel={m.admin_email_consent_opt_out()}
          errorFallback={m.admin_email_consents_error()}
          onHide={() => setOptOut(null)}
          onConfirm={async () => {
            const updated = await emailRequest<EmailConsentRecord[]>(
              `/api/people/${encodeURIComponent(person.id)}/email-consents/${encodeURIComponent(optOut.category_key)}/opt-out`,
              authHeaders,
              m.admin_email_consents_error(),
              undefined,
              undefined,
              "POST",
            );
            client.setQueryData(queryKey, updated);
          }}
        />
      )}
    </Dialog>
  );
}
