import { useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
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
    <Modal show onHide={onClose} centered aria-labelledby="email-compose-title">
      <Modal.Header closeButton>
        <Modal.Title id="email-compose-title">{m.admin_email_preview_title()}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {tooLong && <Alert variant="warning">{m.admin_email_too_long()}</Alert>}
        <Form.Group className="mb-3" controlId="email-compose-recipient">
          <Form.Label>{m.admin_email_to_label()}</Form.Label>
          <Form.Control readOnly value={draft.recipient} />
        </Form.Group>
        <Form.Group className="mb-3" controlId="email-compose-subject">
          <Form.Label>{m.admin_email_subject_label()}</Form.Label>
          <Form.Control readOnly value={draft.subject} />
        </Form.Group>
        <Form.Group controlId="email-compose-body">
          <Form.Label>{m.admin_email_body_label()}</Form.Label>
          <Form.Control as="textarea" rows={10} readOnly value={draft.body} />
        </Form.Group>
        {copyStatus === "copied" && (
          <Alert variant="success" className="mt-3 mb-0">
            {m.admin_email_copied()}
          </Alert>
        )}
        {copyStatus === "failed" && (
          <Alert variant="danger" className="mt-3 mb-0" role="alert">
            {m.admin_email_copy_failed()}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          {m.close()}
        </Button>
        {tooLong ? (
          <Button onClick={() => void copy()}>{m.admin_email_copy_text()}</Button>
        ) : (
          <Button as="a" href={mailto}>
            {m.admin_email_open_client()}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
