import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { clearSignOutReason, peekSignOutReason } from "@/utils/signOutReason";

export default function AdminLoginForm() {
  const auth = useAuth();
  // Snapshot on mount, then clear from an effect so the notice shows for this
  // landing only — not again after a later deliberate sign-out.
  const [signOutReason] = useState(peekSignOutReason);

  useEffect(() => {
    clearSignOutReason();
  }, []);

  return (
    <Container>
      <h2 id="admin-title" className="text-center mb-4 text-warning">
        <i className="bi bi-shield-lock me-2" aria-hidden="true" />
        {m.admin_title()}
      </h2>
      <div className="row justify-content-center">
        <div className="col-12 col-sm-8 col-md-6 col-lg-4 text-center">
          {signOutReason === "session-expired" && !auth.authError ? (
            <Alert variant="info">
              <i className="bi bi-clock-history me-2" aria-hidden="true" />
              {m.auth_session_expired_notice()}
            </Alert>
          ) : null}
          {auth.authError ? (
            <Alert variant="danger" dismissible onClose={auth.clearAuthError}>
              <Alert.Heading as="h3" className="h6">
                {m.auth_error_title()}
              </Alert.Heading>
              <p className="mb-0">{auth.authError}</p>
            </Alert>
          ) : null}
          <Button variant="warning" onClick={() => auth.login()} disabled={auth.isSigningIn}>
            {auth.isSigningIn ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  className="me-2"
                  aria-hidden="true"
                />
                {m.auth_signing_in()}
              </>
            ) : (
              m.admin_login_button()
            )}
          </Button>
        </div>
      </div>
    </Container>
  );
}
