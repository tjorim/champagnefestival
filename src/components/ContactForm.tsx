import React, { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Card, Form, Button, Alert } from "react-bootstrap";

/**
 * Form data structure
 */
interface FormData {
    name: string;
    email: string;
    message: string;
}

/**
 * Contact form component with validation using react-bootstrap components
 */
const ContactForm: React.FC = () => {
    const { t } = useTranslation();
    const [form, setForm] = useState<FormData>({ name: "", email: "", message: "" });
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
        const newErrors: Partial<Record<keyof FormData, string | null>> = {};
        if (!form.name) newErrors.name = t("contact.errors.nameRequired", "Name is required");
        if (!form.email) newErrors.email = t("contact.errors.emailRequired", "Email is required");
        else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = t("contact.errors.emailInvalid", "Please enter a valid email address");
        if (!form.message) newErrors.message = t("contact.errors.messageRequired", "Message is required");

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setIsSubmitting(false);
            return;
        }

        try {
            // Simulate API call (replace with actual API call in real app)
            await new Promise(resolve => setTimeout(resolve, 1000));
            setIsSubmitted(true);
            setForm({ name: "", email: "", message: "" });
            setErrors({});
        } catch (error) {
            console.error("Form submission error", error);
            setGeneralError(t("contact.submissionError", "Something went wrong. Please try again later."));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="max-w-2xl mx-auto border-0 shadow">
            <Card.Body className="p-4">
                {isSubmitted ? (
                    <Alert variant="success">
                        {t("contact.successMessage", "Thank you for your message! We'll get back to you soon.")}
                    </Alert>
                ) : (
                    <Form onSubmit={handleSubmit} className="my-3">
                        {generalError && (
                            <Alert variant="danger" className="d-flex align-items-center">
                                <i className="bi bi-exclamation-circle me-2"></i>
                                <span>{generalError}</span>
                            </Alert>
                        )}

                        <Form.Group className="mb-3">
                            <Form.Label htmlFor="name">
                                {t("contact.name", "Your Name")}
                            </Form.Label>
                            <Form.Control
                                id="name"
                                name="name"
                                value={form.name}
                                onChange={handleChange}
                                placeholder="John Doe"
                                disabled={isSubmitting}
                                isInvalid={!!errors.name}
                                required
                            />
                            <Form.Control.Feedback type="invalid">
                                {errors.name}
                            </Form.Control.Feedback>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label htmlFor="email">
                                {t("contact.email", "Your Email")}
                            </Form.Label>
                            <Form.Control
                                id="email"
                                name="email"
                                type="email"
                                value={form.email}
                                onChange={handleChange}
                                placeholder="email@example.com"
                                disabled={isSubmitting}
                                isInvalid={!!errors.email}
                                required
                            />
                            <Form.Control.Feedback type="invalid">
                                {errors.email}
                            </Form.Control.Feedback>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label htmlFor="message">
                                {t("contact.message", "Your Message")}
                            </Form.Label>
                            <Form.Control
                                as="textarea"
                                id="message"
                                name="message"
                                value={form.message}
                                onChange={handleChange}
                                placeholder="Type your message here..."
                                style={{ minHeight: "120px" }}
                                disabled={isSubmitting}
                                isInvalid={!!errors.message}
                                required
                            />
                            <Form.Control.Feedback type="invalid">
                                {errors.message}
                            </Form.Control.Feedback>
                        </Form.Group>

                        <Button
                            type="submit"
                            variant="dark"
                            className="w-100"
                            style={{
                                background: "linear-gradient(135deg, #6e8efb, #a16efa)",
                                border: "none"
                            }}
                            disabled={isSubmitting}
                            aria-busy={isSubmitting ? "true" : "false"}
                            aria-live="polite"
                        >
                            {isSubmitting ? (
                                <span className="d-flex align-items-center justify-content-center">
                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                    {t("contact.submitting", "Sending...")}
                                </span>
                            ) : (
                                <span className="d-flex align-items-center justify-content-center">
                                    <i className="bi bi-send me-2"></i>
                                    {t("contact.submit", "Send Message")}
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
