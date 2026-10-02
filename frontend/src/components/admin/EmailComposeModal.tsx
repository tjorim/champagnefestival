import { Button, ButtonLink } from "@/components/ui/button";
import { AdminField, AdminLabel, AdminInput, AdminTextarea } from "@/components/admin/AdminFields";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import { buildMailto, MAILTO_MAX_LENGTH, type EmailDraft } from "@/utils/emailComposer";

interface Props {
  draft: EmailDraft | null;
  onClose: () => void;
}

export default function EmailComposeModal({ draft, onClose }: Props) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const mailto = useMemo(() => (draft ? buildMailto(draft) : ""), [draft]);
  if (!draft) return null;
  const tooLong = mailto.length > MAILTO_MAX_LENGTH;
  const emailText = `${m.admin_email_to_label()}: ${draft.recipient}\n${m.admin_email_subject_label()}: ${draft.subject}\n\n${draft.body}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle id="email-compose-title">{m.admin_email_preview_title()}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {tooLong && <Alert variant="warning">{m.admin_email_too_long()}</Alert>}
          <AdminField className="mb-4" controlId="email-compose-recipient">
            <AdminLabel>{m.admin_email_to_label()}</AdminLabel>
            <AdminInput readOnly value={draft.recipient} />
          </AdminField>
          <AdminField className="mb-4" controlId="email-compose-subject">
            <AdminLabel>{m.admin_email_subject_label()}</AdminLabel>
            <AdminInput readOnly value={draft.subject} />
          </AdminField>
          <AdminField controlId="email-compose-body">
            <AdminLabel>{m.admin_email_body_label()}</AdminLabel>
            <AdminTextarea rows={10} readOnly value={draft.body} />
          </AdminField>
          {copyStatus === "copied" && (
            <Alert variant="success" className="mt-4 mb-0">
              {m.admin_email_copied()}
            </Alert>
          )}
          {copyStatus === "failed" && (
            <Alert variant="danger" className="mt-4 mb-0" role="alert">
              {m.admin_email_copy_failed()}
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {m.close()}
          </Button>
          {tooLong ? (
            <Button onClick={() => void copy()}>{m.admin_email_copy_text()}</Button>
          ) : (
            <ButtonLink href={mailto}>{m.admin_email_open_client()}</ButtonLink>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
