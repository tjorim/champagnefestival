import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";
import { deleteMyAccount } from "@/utils/meApi";
import ConfirmModal from "@/components/ConfirmModal";
import MyRegistrationsPage from "@/components/MyRegistrationsPage";
import {
  formatEidNumber,
  formatNiss,
  isValidEidNumber,
  isValidNiss,
} from "@/utils/belgianIdentityNumbers";
import {
  getMyVolunteerIdentity,
  registerMyVolunteerIdentity,
  updateMyEidDocumentNumber,
} from "@/utils/myVolunteerApi";

/**
 * Self-service page for visitors, members, and volunteers alike, reachable
 * only by direct link (no site nav entry — the admin dashboard is the one
 * exception that keeps its own gated route). Unlike PebblePairPage or the
 * admin login, this page never forces an OIDC redirect: a visitor arrives
 * via an emailed magic-link token or an existing visitor session (see
 * MyRegistrationsPage), while a member/volunteer signs in via the "Sign in"
 * option in that same section. Organized into tabs — Registrations (open to
 * everyone), Volunteer eID (OIDC + the `volunteer` realm role, #1006), and
 * Account (OIDC only, since DELETE /api/me requires an OIDC subject) —
 * rendered directly instead of as tabs when only one applies, which is the
 * common case for an anonymous visitor.
 */
export default function MyAccountPage() {
  const {
    isAuthenticated,
    isSigningOut,
    accountLabel,
    hasRole,
    getAccessToken,
    authError,
    clearAuthError,
    logout,
  } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isVolunteer = isAuthenticated && hasRole("volunteer");

  const [name, setName] = useState("");
  const [nationalRegisterNumber, setNationalRegisterNumber] = useState("");
  const [eidDocumentNumber, setEidDocumentNumber] = useState("");
  const [registerValidationError, setRegisterValidationError] = useState("");
  const [newEidDocumentNumber, setNewEidDocumentNumber] = useState("");
  const [correctionValidationError, setCorrectionValidationError] = useState("");

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
    if (!isVolunteer) return;
    identityMutation.reset();
    registerMutation.reset();
    identityMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVolunteer, getAccessToken]);

  const correctionMutation = useMutation({
    mutationFn: () => updateMyEidDocumentNumber(getAccessToken() ?? "", newEidDocumentNumber),
    retry: false,
    onSuccess: () => {
      setNewEidDocumentNumber("");
    },
  });

  const identity =
    correctionMutation.data ?? registerMutation.data ?? identityMutation.data ?? null;

  const handleCorrectionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidEidNumber(newEidDocumentNumber)) {
      setCorrectionValidationError(m.my_eid_invalid_eid());
      return;
    }
    setCorrectionValidationError("");
    correctionMutation.mutate();
  };

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

  const volunteerSection = (
    <>
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
                {identity.eidDocumentNumber ? formatEidNumber(identity.eidDocumentNumber) : "—"}
              </dd>
            </dl>
          </Alert>

          <Alert variant="secondary">
            <h3 className="h6">{m.my_eid_correction_heading()}</h3>
            <p className="small mb-3">{m.my_eid_correction_description()}</p>
            <Form onSubmit={handleCorrectionSubmit}>
              <Form.Group className="mb-3" controlId="my-eid-new-number">
                <Form.Label>{m.my_eid_new_number_label()}</Form.Label>
                <Form.Control
                  value={newEidDocumentNumber}
                  onChange={(event) => setNewEidDocumentNumber(event.target.value)}
                  onBlur={(event) => {
                    if (isValidEidNumber(event.target.value)) {
                      setNewEidDocumentNumber(formatEidNumber(event.target.value));
                    }
                  }}
                  maxLength={50}
                  required
                />
              </Form.Group>
              {(correctionValidationError || correctionMutation.isError) && (
                <Alert variant="danger" className="py-2 small">
                  {correctionValidationError ||
                    (correctionMutation.error instanceof Error
                      ? correctionMutation.error.message
                      : m.my_eid_correction_error())}
                </Alert>
              )}
              {correctionMutation.isSuccess && (
                <Alert variant="success" className="py-2 small mb-3">
                  {m.my_eid_correction_success()}
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
              {registerMutation.isPending ? m.my_eid_submitting() : m.my_eid_register_button()}
            </Button>
          </Form>
        </Alert>
      )}
    </>
  );

  const accountSection = (
    <Alert variant="secondary">
      <h3 className="h6">{m.my_account_delete_heading()}</h3>
      <p className="small mb-3">{m.my_account_delete_description()}</p>
      <Button variant="outline-danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
        {m.my_account_delete_button()}
      </Button>
    </Alert>
  );

  const tabs: { key: string; title: string; content: React.ReactNode }[] = [
    { key: "registrations", title: m.my_registrations_title(), content: <MyRegistrationsPage /> },
  ];
  if (isVolunteer)
    tabs.push({ key: "volunteer", title: m.my_eid_title(), content: volunteerSection });
  if (isAuthenticated)
    tabs.push({ key: "account", title: m.my_account_title(), content: accountSection });

  return (
    <Container className="py-5" style={{ maxWidth: "540px" }}>
      <h1 id="my-account-title" className="h4 mb-4 text-center">
        {m.my_account_title()}
      </h1>

      {authError && (
        <Alert variant="danger" dismissible onClose={clearAuthError}>
          {authError}
        </Alert>
      )}

      {isSigningOut ? (
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

          {tabs.length > 1 ? (
            <Tabs defaultActiveKey="registrations" className="mb-3">
              {tabs.map((tab) => (
                <Tab key={tab.key} eventKey={tab.key} title={tab.title}>
                  <div className="pt-3">{tab.content}</div>
                </Tab>
              ))}
            </Tabs>
          ) : (
            tabs[0]?.content
          )}
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
