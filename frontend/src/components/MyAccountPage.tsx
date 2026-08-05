import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";
import { deleteMyAccount } from "@/utils/meApi";

/**
 * Self-service account page, reachable only by direct link (no site nav entry) —
 * mirrors the auth pattern used by PebblePairPage. Currently offers account
 * deletion (DELETE /api/me); registrations/order items/payment/check-in history
 * are festival records and are kept, per the endpoint's own contract.
 */
export default function MyAccountPage() {
  const {
    isAuthenticated,
    isLoading,
    isSigningOut,
    accountLabel,
    getAccessToken,
    authError,
    clearAuthError,
    login,
    logout,
  } = useAuth();
  const loginRequested = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (isLoading || isAuthenticated || authError || loginRequested.current) return;
    loginRequested.current = true;
    login("/me");
  }, [isLoading, isAuthenticated, authError, login]);

  const retrySignIn = () => {
    setDeleteError("");
    loginRequested.current = true;
    clearAuthError();
    login("/me");
  };

  const handleDelete = async () => {
    if (!window.confirm(m.my_account_delete_confirm())) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;

    setDeleteError("");
    setIsDeleting(true);
    try {
      await deleteMyAccount(accessToken);
      logout();
    } catch (error) {
      setIsDeleting(false);
      setDeleteError(error instanceof Error ? error.message : m.my_account_delete_error());
    }
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

          {deleteError && (
            <Alert variant="danger" role="alert">
              {deleteError}
            </Alert>
          )}

          <Alert variant="secondary">
            <h2 className="h6">{m.my_account_delete_heading()}</h2>
            <p className="small mb-3">{m.my_account_delete_description()}</p>
            <Button variant="outline-danger" size="sm" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  {m.my_account_deleting()}
                </>
              ) : (
                m.my_account_delete_button()
              )}
            </Button>
          </Alert>
        </>
      )}
    </Container>
  );
}
