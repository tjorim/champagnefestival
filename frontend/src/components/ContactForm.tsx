import { CircleAlertIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";
import { m } from "@/paraglide/messages";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  PublicError,
  PublicField,
  PublicInput,
  PublicLabel,
  PublicTextarea,
} from "@/components/PublicFields";
import { EMAIL_REGEX } from "@/config/constants";

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

function contactErrorMessage(result: unknown): string {
  if (typeof result !== "object" || result === null || !("detail" in result)) {
    return m.contact_submission_error();
  }
  const detail = result.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const validationMessage = detail.find(
      (item): item is { msg: string } =>
        typeof item === "object" && item !== null && "msg" in item && typeof item.msg === "string",
    );
    if (validationMessage) return validationMessage.msg;
  }
  return m.contact_submission_error();
}

async function submitContactForm(form: FormData, submissionId: string): Promise<void> {
  const response = await fetch("/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      submission_id: submissionId,
      name: form.name,
      email: form.email,
      message: form.message,
      honeypot: form.honeypot,
      form_start_time: form.formStartTime,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ContactSubmissionError(contactErrorMessage(result));
  }
}

/**
 * Contact form component with TanStack Form validation and owned field controls
 */
const ContactForm = () => {
  const [formStartTime] = useState(() => new Date().toISOString());
  const submissionId = useRef(crypto.randomUUID());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const submitContactMutation = useMutation({
    mutationFn: (form: FormData) => submitContactForm(form, submissionId.current),
    retry: false,
  });

  const isSubmitting = submitContactMutation.isPending;

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      message: "",
      honeypot: "",
      formStartTime,
    } as FormData,
    onSubmit: async ({ value }) => {
      setGeneralError(null);

      // Anti-spam check: if honeypot is filled, silently "succeed" without sending
      if (value.honeypot) {
        console.warn("Honeypot triggered - likely bot submission");
        // Fake success to confuse bots
        setIsSubmitted(true);
        return;
      }

      try {
        await submitContactMutation.mutateAsync(value);
        submissionId.current = crypto.randomUUID();
        setIsSubmitted(true);
        form.reset({
          name: "",
          email: "",
          message: "",
          honeypot: "",
          formStartTime,
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
    },
  });

  return (
    <Card className="mx-auto border-0 shadow-lg">
      <CardContent className="p-4 site-md:p-6">
        {isSubmitted ? (
          <Alert variant="success">{m.contact_success_message()}</Alert>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
            className="my-4"
            name="contact-form"
            autoComplete="on"
            noValidate
          >
            {generalError && (
              <Alert variant="danger" className="flex items-center">
                <Icon icon={CircleAlertIcon} className="me-2" />
                <span>{generalError}</span>
              </Alert>
            )}

            {/* Hidden honeypot field to catch bots - placed early to trap bots */}
            <form.Field name="honeypot">
              {(field) => (
                <div className="hidden">
                  <PublicInput
                    type="text"
                    autoComplete="off"
                    tabIndex={-1}
                    aria-hidden="true"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            <form.Field
              name="name"
              validators={[
                {
                  run: ({ value }) =>
                    !value?.trim() ? m.contact_errors_name_required() : undefined,
                  triggers: ["change"],
                },
              ]}
            >
              {(field) => {
                const showErr = field.meta.isTouched && field.errors.length > 0;
                return (
                  <PublicField className="mb-4 text-left" controlId="name">
                    <PublicLabel>{m.contact_name()}</PublicLabel>
                    <PublicInput
                      placeholder={m.contact_placeholder_name()}
                      disabled={isSubmitting}
                      aria-invalid={showErr}
                      autoComplete="name"
                      required
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    {showErr && <PublicError>{field.errors[0]?.message}</PublicError>}
                  </PublicField>
                );
              }}
            </form.Field>

            <form.Field
              name="email"
              validators={[
                {
                  run: ({ value }) => {
                    if (!value?.trim()) return m.contact_errors_email_required();
                    if (!EMAIL_REGEX.test(value)) return m.contact_errors_email_invalid();
                    return undefined;
                  },
                  triggers: ["change"],
                },
              ]}
            >
              {(field) => {
                const showErr = field.meta.isTouched && field.errors.length > 0;
                return (
                  <PublicField className="mb-4 text-left" controlId="email">
                    <PublicLabel>{m.contact_email()}</PublicLabel>
                    <PublicInput
                      type="email"
                      placeholder={m.contact_placeholder_email()}
                      disabled={isSubmitting}
                      aria-invalid={showErr}
                      autoComplete="email"
                      required
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    {showErr && <PublicError>{field.errors[0]?.message}</PublicError>}
                  </PublicField>
                );
              }}
            </form.Field>

            <form.Field
              name="message"
              validators={[
                {
                  run: ({ value }) =>
                    !value?.trim() ? m.contact_errors_message_required() : undefined,
                  triggers: ["change"],
                },
              ]}
            >
              {(field) => {
                const showErr = field.meta.isTouched && field.errors.length > 0;
                return (
                  <PublicField className="mb-4 text-left" controlId="message">
                    <PublicLabel>{m.contact_message()}</PublicLabel>
                    <PublicTextarea
                      className="min-h-30"
                      placeholder={m.contact_placeholder_message()}
                      disabled={isSubmitting}
                      aria-invalid={showErr}
                      autoComplete="off"
                      required
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                    {showErr && <PublicError>{field.errors[0]?.message}</PublicError>}
                  </PublicField>
                );
              }}
            </form.Field>

            <Button
              type="submit"
              variant="brand"
              className="w-full"
              disabled={isSubmitting}
              aria-busy={isSubmitting ? "true" : "false"}
              aria-live="polite"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <Spinner size="sm" className="me-2" />
                  {m.contact_submitting()}
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <Icon icon={SendIcon} className="me-2" />
                  {m.contact_submit()}
                </span>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default ContactForm;
