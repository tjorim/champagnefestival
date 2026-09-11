import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";
import {
  claimMyVolunteerIdentity,
  getMyVolunteerIdentity,
  submitEidCorrection,
} from "@/utils/myVolunteerApi";

/**
 * Self-service volunteer identity page, reachable only by direct link (no
 * site nav entry) — mirrors MyAccountPage's OIDC login-on-mount pattern.
 * Lets a volunteer see their own stored NISS/eID once linked (#1006), claim
 * the link themselves by NISS if not yet linked, and flag an eID renewal for
 * admin review — never a direct write, since eid_document_number backs an
 * insurance record.
 */
export default function MyEidPage() {
  const {
    isAuthenticated,
    isLoading,
    accountLabel,
    getAccessToken,
    authError,
    clearAuthError,
    login,
  } = useAuth();
  const loginRequested = useRef(false);
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false);
  const [nationalRegisterNumber, setNationalRegisterNumber] = useState("");
  const [newEidDocumentNumber, setNewEidDocumentNumber] = useState("");
  const [note, setNote] = useState("");
  const submissionId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (isLoading || isAuthenticated || authError || loginRequested.current) return;
    loginRequested.current = true;
    login("/my-eid");
  }, [isLoading, isAuthenticated, authError, login]);

  const retrySignIn = () => {
    loginRequested.current = true;
    clearAuthError();
    login("/my-eid");
  };

  const identityMutation = useMutation({
    mutationFn: () => getMyVolunteerIdentity(getAccessToken() ?? ""),
    retry: false,
  });

  const claimMutation = useMutation({
    mutationFn: (niss: string) => claimMyVolunteerIdentity(getAccessToken() ?? "", niss),
    retry: false,
    onSuccess: () => setNationalRegisterNumber(""),
  });

  // getAccessToken is only a new reference when the underlying OIDC user
  // object changes (login, silent renewal, or a different account), so this
  // re-runs exactly on those transitions rather than once on mount — a
  // loaded-once ref would otherwise keep showing a previous account's
  // NISS/eID after the OIDC user changes underneath this still-mounted page
  // (#1037 review).
  useEffect(() => {
    if (!isAuthenticated) return;
    identityMutation.reset();
    claimMutation.reset();
    identityMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, getAccessToken]);

  const correctionMutation = useMutation({
    mutationFn: () =>
      submitEidCorrection(getAccessToken() ?? "", {
        submissionId: submissionId.current,
        newEidDocumentNumber,
        note,
      }),
    retry: false,
    onSuccess: () => {
      setCorrectionSubmitted(true);
      setNewEidDocumentNumber("");
      setNote("");
      submissionId.current = crypto.randomUUID();
    },
  });

  const identity = claimMutation.data ?? identityMutation.data ?? null;

  return (
    <Container className="py-5" style={{ maxWidth: "540px" }}>
      <h1 className="h4 mb-4 text-center">{m.my_eid_title()}</h1>

      {authError ? (
        <Alert variant="danger" className="text-center">
          <div>{authError}</div>
          <Button className="mt-3" variant="outline-danger" size="sm" onClick={retrySignIn}>
            {m.pebble_pair_retry_sign_in()}
          </Button>
        </Alert>
      ) : !isAuthenticated ? (
        <div className="d-flex align-items-center justify-content-center gap-2 text-secondary">
          <Spinner animation="border" size="sm" />
          {m.auth_signing_in()}
        </div>
      ) : (
        <>
          {accountLabel && (
            <p className="text-center text-secondary mb-4">
              {m.my_account_signed_in_as({ account: accountLabel })}
            </p>
          )}

          {identityMutation.isPending ? (
            <div className="d-flex align-items-center justify-content-center gap-2 text-secondary">
              <Spinner animation="border" size="sm" />
            </div>
          ) : identityMutation.isError && !identity ? (
            <Alert variant="danger">{m.my_eid_load_error()}</Alert>
          ) : identity?.linked ? (
            <>
              <Alert variant="secondary">
                <h2 className="h6">{m.my_eid_identity_heading()}</h2>
                <dl className="row mb-0 small">
                  <dt className="col-5">{m.my_eid_niss_label()}</dt>
                  <dd className="col-7">{identity.nationalRegisterNumber ?? "—"}</dd>
                  <dt className="col-5 mb-0">{m.my_eid_eid_label()}</dt>
                  <dd className="col-7 mb-0">{identity.eidDocumentNumber ?? "—"}</dd>
                </dl>
              </Alert>

              <Alert variant="secondary">
                <h2 className="h6">{m.my_eid_correction_heading()}</h2>
                <p className="small mb-3">{m.my_eid_correction_description()}</p>
                {correctionSubmitted ? (
                  <Alert variant="success" className="mb-0">
                    {m.my_eid_correction_submitted()}
                  </Alert>
                ) : (
                  <Form
                    onSubmit={(event) => {
                      event.preventDefault();
                      correctionMutation.mutate();
                    }}
                  >
                    <Form.Group className="mb-3" controlId="my-eid-new-number">
                      <Form.Label>{m.my_eid_new_number_label()}</Form.Label>
                      <Form.Control
                        value={newEidDocumentNumber}
                        onChange={(event) => setNewEidDocumentNumber(event.target.value)}
                        maxLength={50}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="my-eid-note">
                      <Form.Label>{m.my_eid_note_label()}</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={2000}
                      />
                    </Form.Group>
                    {correctionMutation.isError && (
                      <Alert variant="danger" className="py-2 small">
                        {correctionMutation.error instanceof Error
                          ? correctionMutation.error.message
                          : m.my_eid_correction_error()}
                      </Alert>
                    )}
                    <Button
                      type="submit"
                      variant="outline-primary"
                      size="sm"
                      disabled={correctionMutation.isPending}
                    >
                      {correctionMutation.isPending
                        ? m.my_eid_submitting()
                        : m.my_eid_submit_correction()}
                    </Button>
                  </Form>
                )}
              </Alert>
            </>
          ) : (
            <Alert variant="secondary">
              <h2 className="h6">{m.my_eid_claim_heading()}</h2>
              <p className="small mb-3">{m.my_eid_claim_description()}</p>
              <Form
                onSubmit={(event) => {
                  event.preventDefault();
                  claimMutation.mutate(nationalRegisterNumber);
                }}
              >
                <Form.Group className="mb-3" controlId="my-eid-niss">
                  <Form.Label>{m.my_eid_niss_label()}</Form.Label>
                  <Form.Control
                    value={nationalRegisterNumber}
                    onChange={(event) => setNationalRegisterNumber(event.target.value)}
                    maxLength={20}
                    required
                  />
                </Form.Group>
                {claimMutation.isError && (
                  <Alert variant="danger" className="py-2 small">
                    {claimMutation.error instanceof Error
                      ? claimMutation.error.message
                      : m.my_eid_claim_error()}
                  </Alert>
                )}
                <Button
                  type="submit"
                  variant="outline-primary"
                  size="sm"
                  disabled={claimMutation.isPending}
                >
                  {claimMutation.isPending ? m.my_eid_submitting() : m.my_eid_claim_button()}
                </Button>
              </Form>
            </Alert>
          )}
        </>
      )}
    </Container>
  );
}
