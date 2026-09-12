import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";
import { deleteMyAccount } from "@/utils/meApi";
import ConfirmModal from "@/components/ConfirmModal";
import {
  formatEidNumber,
  formatNiss,
  isValidEidNumber,
  isValidNiss,
} from "@/utils/belgianIdentityNumbers";
import {
  getMyVolunteerIdentity,
  registerMyVolunteerIdentity,
  submitEidCorrection,
} from "@/utils/myVolunteerApi";

/**
 * Self-service account page, reachable only by direct link (no site nav entry) —
 * mirrors the auth pattern used by PebblePairPage. Offers account deletion
 * (DELETE /api/me) to every signed-in user, and, only for accounts holding the
 * OIDC `volunteer` realm role, the NISS/eID self-service section from #1006:
 * view or register your own volunteer identity, and flag an eID renewal for
 * admin review (never a direct write, since eid_document_number backs an
 * insurance record — see docs/decisions/1006-volunteer-identity-self-service.md).
 * Registrations/order items/payment/check-in history are festival records and
 * are kept, per the account-deletion endpoint's own contract.
 */
export default function MyAccountPage() {
  const {
    isAuthenticated,
    isLoading,
    isSigningOut,
    accountLabel,
    hasRole,
    getAccessToken,
    authError,
    clearAuthError,
    login,
    logout,
  } = useAuth();
  const loginRequested = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isVolunteer = hasRole("volunteer");

  const [correctionSubmitted, setCorrectionSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [nationalRegisterNumber, setNationalRegisterNumber] = useState("");
  const [eidDocumentNumber, setEidDocumentNumber] = useState("");
  const [registerValidationError, setRegisterValidationError] = useState("");
  const [newEidDocumentNumber, setNewEidDocumentNumber] = useState("");
  const [note, setNote] = useState("");
  const submissionId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (isLoading || isAuthenticated || authError || loginRequested.current) return;
    loginRequested.current = true;
    login("/me");
  }, [isLoading, isAuthenticated, authError, login]);

  const retrySignIn = () => {
    loginRequested.current = true;
    clearAuthError();
    login("/me");
  };

  const handleDelete = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error(m.my_account_delete_error());
    await deleteMyAccount(accessToken);
    logout();
  };

  const identityMutation = useMutation({
    mutationFn: () => getMyVolunteerIdentity(getAccessToken() ?? ""),
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      registerMyVolunteerIdentity(getAccessToken() ?? "", {
        name,
        nationalRegisterNumber,
        eidDocumentNumber,
      }),
    retry: false,
  });

  // getAccessToken is only a new reference when the underlying OIDC user
  // object changes (login, silent renewal, or a different account), so this
  // re-runs exactly on those transitions rather than once on mount — a
  // loaded-once ref would otherwise keep showing a previous account's
  // NISS/eID after the OIDC user changes underneath this still-mounted page
  // (#1037 review).
  useEffect(() => {
    if (!isAuthenticated || !isVolunteer) return;
    identityMutation.reset();
    registerMutation.reset();
    identityMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isVolunteer, getAccessToken]);

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

  const identity = registerMutation.data ?? identityMutation.data ?? null;

  const handleRegisterSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidNiss(nationalRegisterNumber)) {
      setRegisterValidationError(m.my_eid_invalid_niss());
      return;
    }
    if (!isValidEidNumber(eidDocumentNumber)) {
      setRegisterValidationError(m.my_eid_invalid_eid());
      return;
    }
    setRegisterValidationError("");
    registerMutation.mutate();
  };

  return (
    <Container className="py-5" style={{ maxWidth: "540px" }}>
      <h1 className="h4 mb-4 text-center">{m.my_account_title()}</h1>

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
      ) : isSigningOut ? (
        <div className="d-flex align-items-center justify-content-center gap-2 text-secondary">
          <Spinner animation="border" size="sm" />
          {m.auth_signing_out()}
        </div>
      ) : (
        <>
          {accountLabel && (
            <p className="text-center text-secondary mb-4">
              {m.my_account_signed_in_as({ account: accountLabel })}
            </p>
          )}

          {isVolunteer && (
            <>
              <h2 className="h5 mb-3">{m.my_eid_title()}</h2>

              {identityMutation.isPending ? (
                <div className="d-flex align-items-center justify-content-center gap-2 text-secondary mb-3">
                  <Spinner animation="border" size="sm" />
                </div>
              ) : identityMutation.isError && !identity ? (
                <Alert variant="danger">{m.my_eid_load_error()}</Alert>
              ) : identity?.linked ? (
                <>
                  <Alert variant="secondary">
                    <h3 className="h6">{m.my_eid_identity_heading()}</h3>
                    <dl className="row mb-0 small">
                      <dt className="col-5">{m.my_eid_niss_label()}</dt>
                      <dd className="col-7">
                        {identity.nationalRegisterNumber
                          ? formatNiss(identity.nationalRegisterNumber)
                          : "—"}
                      </dd>
                      <dt className="col-5 mb-0">{m.my_eid_eid_label()}</dt>
                      <dd className="col-7 mb-0">
                        {identity.eidDocumentNumber
                          ? formatEidNumber(identity.eidDocumentNumber)
                          : "—"}
                      </dd>
                    </dl>
                  </Alert>

                  <Alert variant="secondary">
                    <h3 className="h6">{m.my_eid_correction_heading()}</h3>
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
                  <h3 className="h6">{m.my_eid_register_heading()}</h3>
                  <p className="small mb-3">{m.my_eid_register_description()}</p>
                  <Form onSubmit={handleRegisterSubmit}>
                    <Form.Group className="mb-3" controlId="my-eid-name">
                      <Form.Label>{m.my_eid_name_label()}</Form.Label>
                      <Form.Control
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={200}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="my-eid-niss">
                      <Form.Label>{m.my_eid_niss_label()}</Form.Label>
                      <Form.Control
                        value={nationalRegisterNumber}
                        onChange={(event) => setNationalRegisterNumber(event.target.value)}
                        onBlur={(event) => {
                          if (isValidNiss(event.target.value))
                            setNationalRegisterNumber(formatNiss(event.target.value));
                        }}
                        maxLength={20}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="my-eid-eid">
                      <Form.Label>{m.my_eid_eid_label()}</Form.Label>
                      <Form.Control
                        value={eidDocumentNumber}
                        onChange={(event) => setEidDocumentNumber(event.target.value)}
                        onBlur={(event) => {
                          if (isValidEidNumber(event.target.value)) {
                            setEidDocumentNumber(formatEidNumber(event.target.value));
                          }
                        }}
                        maxLength={50}
                        required
                      />
                    </Form.Group>
                    {(registerValidationError || registerMutation.isError) && (
                      <Alert variant="danger" className="py-2 small">
                        {registerValidationError ||
                          (registerMutation.error instanceof Error
                            ? registerMutation.error.message
                            : m.my_eid_register_error())}
                      </Alert>
                    )}
                    <Button
                      type="submit"
                      variant="outline-primary"
                      size="sm"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending
                        ? m.my_eid_submitting()
                        : m.my_eid_register_button()}
                    </Button>
                  </Form>
                </Alert>
              )}
            </>
          )}

          <Alert variant="secondary">
            <h2 className="h6">{m.my_account_delete_heading()}</h2>
            <p className="small mb-3">{m.my_account_delete_description()}</p>
            <Button variant="outline-danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
              {m.my_account_delete_button()}
            </Button>
          </Alert>
        </>
      )}

      <ConfirmModal
        show={showDeleteConfirm}
        title={m.my_account_delete_heading()}
        body={m.my_account_delete_confirm()}
        errorFallback={m.my_account_delete_error()}
        onConfirm={handleDelete}
        onHide={() => setShowDeleteConfirm(false)}
      />
    </Container>
  );
}
