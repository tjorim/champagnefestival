import React, { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { m } from "@/paraglide/messages";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";

/**
 * Form data structure
 */
interface FormData {
  name: string;
  email: string;
  message: string;
  honeypot?: string; // Anti-spam honeypot field
  formStartTime: string; // When the form was loaded (to detect bots filling too quickly)
  recaptchaToken?: string; // Optional reCAPTCHA token obtained via reCAPTCHA API integration (e.g., using grecaptcha.execute)
}

/**
 * Contact form component with validation using react-bootstrap components
 */
const ContactForm: React.FC = () => {
  const [form, setForm] = useState<FormData>(() => ({
    name: "",
    email: "",
    message: "",
    honeypot: "",
    formStartTime: new Date().toISOString(), // Initialize only once
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string | null>>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Handle form field changes
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });

    // Clear error when user starts typing again
    if (errors[name as keyof FormData]) {
      setErrors({ ...errors, [name]: null });
    }

    // Clear general error when user makes any changes
    if (generalError) {
      setGeneralError(null);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setGeneralError(null); // Reset general error on new submission attempt

    // Basic validation
    // Check if required fields are filled
    const newErrors: Partial<Record<keyof FormData, string | null>> = {};
    if (!form.name) newErrors.name = m.contact_errors_name_required();
    if (!form.email) newErrors.email = m.contact_errors_email_required();
    else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = m.contact_errors_email_invalid();
    if (!form.message) newErrors.message = m.contact_errors_message_required();

    // Anti-spam check: if honeypot is filled, silently "succeed" without sending
    if (form.honeypot) {
      console.warn("Honeypot triggered - likely bot submission");
      // Fake success to confuse bots
      setIsSubmitted(true);
      setIsSubmitting(false);
      return;
    }

    // Check if there are any validation errors
    // If there are errors, set them and stop submission
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsSubmitting(false);
      return;
    }

    // If no errors, proceed with submission
    try {
      // Call the FastAPI backend endpoint
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          message: form.message,
          honeypot: form.honeypot,
          form_start_time: form.formStartTime,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Something went wrong");
      }

      setIsSubmitted(true);
      setForm({
        name: "",
        email: "",
        message: "",
        honeypot: "",
        formStartTime: form.formStartTime, // Keep original form start time
      });
      setErrors({});
    } catch (error) {
      console.warn("Form submission error:", error);
      // Provide more specific error messages based on error type
      if (error instanceof TypeError && error.message.includes("fetch")) {
        // Network connectivity issues
        setGeneralError(m.contact_network_error());
      } else if (error instanceof Error && error.message.includes("JSON")) {
        // JSON parsing issues from server response
        setGeneralError(m.contact_submission_error());
      } else {
        // General server or validation errors
        setGeneralError(m.contact_submission_error());
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto border-0 shadow">
      <Card.Body className="p-3 p-md-4">
        {isSubmitted ? (
          <Alert variant="success">{m.contact_success_message()}</Alert>
        ) : (
          <Form onSubmit={handleSubmit} className="my-3" name="contact-form" autoComplete="on">
            {generalError && (
              <Alert variant="danger" className="d-flex align-items-center">
                <i className="bi bi-exclamation-circle me-2"></i>
                <span>{generalError}</span>
              </Alert>
            )}

            {/* Hidden honeypot field to catch bots - placed early to trap bots */}
            <div className="d-none">
              <Form.Control
                name="honeypot"
                type="text"
                autoComplete="off"
                value={form.honeypot}
                onChange={handleChange}
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>

            <Form.Group className="mb-3 text-start">
              <Form.Label htmlFor="name">{m.contact_name()}</Form.Label>
              <Form.Control
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder={m.contact_placeholder_name()}
                disabled={isSubmitting}
                isInvalid={!!errors.name}
                autoComplete="name"
                required
              />
              <Form.Control.Feedback type="invalid">{errors.name}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3 text-start">
              <Form.Label htmlFor="email">{m.contact_email()}</Form.Label>
              <Form.Control
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder={m.contact_placeholder_email()}
                disabled={isSubmitting}
                isInvalid={!!errors.email}
                autoComplete="email"
                required
              />
              <Form.Control.Feedback type="invalid">{errors.email}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3 text-start">
              <Form.Label htmlFor="message">{m.contact_message()}</Form.Label>
              <Form.Control
                as="textarea"
                id="message"
                name="message"
                value={form.message}
                onChange={handleChange}
                placeholder={m.contact_placeholder_message()}
                style={{ minHeight: "120px" }}
                disabled={isSubmitting}
                isInvalid={!!errors.message}
                autoComplete="off"
                required
              />
              <Form.Control.Feedback type="invalid">{errors.message}</Form.Control.Feedback>
            </Form.Group>

            <Button
              type="submit"
              variant="dark"
              className="btn w-100 bg-brand-gradient text-white"
              disabled={isSubmitting}
              aria-busy={isSubmitting ? "true" : "false"}
              aria-live="polite"
            >
              {isSubmitting ? (
                <span className="d-flex align-items-center justify-content-center">
                  <Spinner animation="border" size="sm" className="me-2" />
                  {m.contact_submitting()}
                </span>
              ) : (
                <span className="d-flex align-items-center justify-content-center">
                  <i className="bi bi-send me-2"></i>
                  {m.contact_submit()}
                </span>
              )}
            </Button>
          </Form>
        )}
      </Card.Body>
    </Card>
  );
};

export default ContactForm;
