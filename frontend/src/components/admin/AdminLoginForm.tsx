import React from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";

interface AdminLoginFormProps {
  token: string;
  onTokenChange: (value: string) => void;
  loginError: string;
  isLoggingIn: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export default function AdminLoginForm({
  token,
  onTokenChange,
  loginError,
  isLoggingIn,
  onSubmit,
}: AdminLoginFormProps) {
  return (
    <Container>
      <h2 id="admin-title" className="text-center mb-4 text-warning">
        <i className="bi bi-shield-lock me-2" aria-hidden="true" />
        {m.admin_title()}
      </h2>
      <div className="row justify-content-center">
        <div className="col-12 col-sm-8 col-md-6 col-lg-4">
          <Card bg="dark" text="white" border="warning">
            <Card.Header className="border-warning">
              <Card.Title className="mb-0">{m.admin_login_title()}</Card.Title>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={onSubmit}>
                <Form.Group className="mb-3" controlId="admin-token">
                  <Form.Label>{m.admin_token_label()}</Form.Label>
                  <Form.Control
                    type="password"
                    value={token}
                    onChange={(e) => onTokenChange(e.target.value)}
                    placeholder={m.admin_token_placeholder()}
                    className="bg-dark text-light border-secondary"
                    autoComplete="current-password"
                    required
                  />
                </Form.Group>
                {loginError && (
                  <Alert variant="danger" className="py-2">
                    {loginError}
                  </Alert>
                )}
                <Button
                  type="submit"
                  variant="warning"
                  className="w-100"
                  disabled={isLoggingIn || !token.trim()}
                >
                  {isLoggingIn ? (
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      aria-hidden="true"
                    />
                  ) : (
                    m.admin_login_button()
                  )}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </div>
      </div>
    </Container>
  );
}
