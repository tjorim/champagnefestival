import Container from "react-bootstrap/Container";
import { AuthPage } from "supertokens-auth-react/ui";
import { EmailPasswordPreBuiltUI } from "supertokens-auth-react/recipe/emailpassword/prebuiltui";
import { m } from "@/paraglide/messages";

export default function AdminLoginForm() {
  return (
    <Container>
      <h2 id="admin-title" className="text-center mb-4 text-warning">
        <i className="bi bi-shield-lock me-2" aria-hidden="true" />
        {m.admin_title()}
      </h2>
      <div className="row justify-content-center">
        <div className="col-12 col-sm-8 col-md-6 col-lg-4">
          <AuthPage
            preBuiltUIList={[EmailPasswordPreBuiltUI]}
            redirectOnSessionExists={false}
          />
        </div>
      </div>
    </Container>
  );
}

