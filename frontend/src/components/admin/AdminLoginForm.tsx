import { useAuth } from "@/contexts/AuthContext";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import { m } from "@/paraglide/messages";

export default function AdminLoginForm() {
  const auth = useAuth();

  return (
    <Container>
      <h2 id="admin-title" className="text-center mb-4 text-warning">
        <i className="bi bi-shield-lock me-2" aria-hidden="true" />
        {m.admin_title()}
      </h2>
      <div className="row justify-content-center">
        <div className="col-12 col-sm-8 col-md-6 col-lg-4 text-center">
          {auth.authError ? (
            <Alert variant="danger" dismissible onClose={auth.clearAuthError}>
              <Alert.Heading as="h3" className="h6">
                {m.auth_error_title()}
              </Alert.Heading>
              <p className="mb-0">{auth.authError}</p>
            </Alert>
          ) : null}
          <Button variant="warning" onClick={() => auth.login()}>
            {m.admin_login_button()}
          </Button>
        </div>
      </div>
    </Container>
  );
}
