import { useMutation } from "@tanstack/react-query";
import React, { useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
  honeypot: string;
  formStartTime: string;
}

class ContactSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactSubmissionError";
  }
}

async function submitContactForm(form: FormData): Promise<void> {
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

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ContactSubmissionError(
      (result as { message?: string }).message ?? m.contact_submission_error(),
    );
  }
}

/**
 * Contact form component with validation using react-bootstrap components
 */
const ContactForm: React.FC = () => {
  const formStartTime = useRef(new Date().toISOString());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    clearErrors,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      email: "",
      message: "",
      honeypot: "",
      formStartTime: formStartTime.current,
    },
  });

  const submitContactMutation = useMutation({
    mutationFn: submitContactForm,
    retry: false,
  });

  const isSubmitting = submitContactMutation.isPending;

  const onSubmit = async (data: FormData) => {
    setGeneralError(null);

    // Anti-spam check: if honeypot is filled, silently "succeed" without sending
    if (data.honeypot) {
      console.warn("Honeypot triggered - likely bot submission");
      // Fake success to confuse bots
      setIsSubmitted(true);
      return;
    }

    try {
      await submitContactMutation.mutateAsync(data);
      setIsSubmitted(true);
      reset({
        name: "",
        email: "",
        message: "",
        honeypot: "",
        formStartTime: formStartTime.current,
      });
    } catch (error) {
      console.warn("Form submission error:", error);
      if (error instanceof TypeError && error.message.includes("fetch")) {
        // Network connectivity issues
        setGeneralError(m.contact_network_error());
      } else if (error instanceof ContactSubmissionError) {
        setGeneralError(error.message);
      } else {
        // General server or validation errors
        setGeneralError(m.contact_submission_error());
      }
    }
  };

  return (
    <Card className="mx-auto border-0 shadow">
      <Card.Body className="p-3 p-md-4">
        {isSubmitted ? (
          <Alert variant="success">{m.contact_success_message()}</Alert>
        ) : (
          <Form
            onSubmit={handleSubmit(onSubmit)}
            onChange={(e: React.ChangeEvent<HTMLFormElement>) => {
              const name = (e.target as Element).getAttribute("name") as keyof FormData | null;
              if (name) clearErrors(name);
              if (generalError) setGeneralError(null);
            }}
            className="my-3"
            name="contact-form"
            autoComplete="on"
            noValidate
          >
            {generalError && (
              <Alert variant="danger" className="d-flex align-items-center">
                <i className="bi bi-exclamation-circle me-2"></i>
                <span>{generalError}</span>
              </Alert>
            )}

            {/* Hidden honeypot field to catch bots - placed early to trap bots */}
            <div className="d-none">
              <Form.Control
                type="text"
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
                {...register("honeypot")}
              />
            </div>
            <Form.Control type="hidden" {...register("formStartTime")} />

            <Form.Group className="mb-3 text-start">
              <Form.Label htmlFor="name">{m.contact_name()}</Form.Label>
              <Form.Control
                id="name"
                placeholder={m.contact_placeholder_name()}
                disabled={isSubmitting}
                isInvalid={!!errors.name}
                autoComplete="name"
                required
                {...register("name", { required: m.contact_errors_name_required() })}
              />
              <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3 text-start">
              <Form.Label htmlFor="email">{m.contact_email()}</Form.Label>
              <Form.Control
                id="email"
                type="email"
                placeholder={m.contact_placeholder_email()}
                disabled={isSubmitting}
                isInvalid={!!errors.email}
                autoComplete="email"
                required
                {...register("email", {
                  required: m.contact_errors_email_required(),
                  pattern: {
                    value: /\S+@\S+\.\S+/,
                    message: m.contact_errors_email_invalid(),
                  },
                })}
              />
              <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3 text-start">
              <Form.Label htmlFor="message">{m.contact_message()}</Form.Label>
              <Form.Control
                as="textarea"
                id="message"
                placeholder={m.contact_placeholder_message()}
                style={{ minHeight: "120px" }}
                disabled={isSubmitting}
                isInvalid={!!errors.message}
                autoComplete="off"
                required
                {...register("message", { required: m.contact_errors_message_required() })}
              />
              <Form.Control.Feedback type="invalid">
                {errors.message?.message}
              </Form.Control.Feedback>
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
