'use client';

import React, { useState, useEffect } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { Dictionary } from "@/lib/i18n";

/**
 * Form data structure
 */
interface FormData {
    name: string;
    email: string;
    message: string;
}

interface ContactFormProps {
    dictionary: Dictionary;
}

/**
 * Contact form component with validation using react-bootstrap components
 */
const ContactForm: React.FC<ContactFormProps> = ({ dictionary }) => {
    const [form, setForm] = useState<FormData>({ name: "", email: "", message: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof FormData, string | null>>>({});
    const [generalError, setGeneralError] = useState<string | null>(null);
    const [submissionTimeoutId, setSubmissionTimeoutId] = useState<number | null>(null);

    // Cleanup timeouts when component unmounts
    useEffect(() => {
        return () => {
            // Clear form submission timeout if it exists
            if (submissionTimeoutId) {
                window.clearTimeout(submissionTimeoutId);
            }
        };
    }, [submissionTimeoutId]);

    // Dictionary is now passed as a prop, so we don't need to check if it's loaded

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
        if (!form.name) newErrors.name = dictionary.contact.errors.nameRequired;
        if (!form.email) newErrors.email = dictionary.contact.errors.emailRequired;
        else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = dictionary.contact.errors.emailInvalid;
        if (!form.message) newErrors.message = dictionary.contact.errors.messageRequired;

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setIsSubmitting(false);
            return;
        }

        try {
            // Use Next.js Server Action to handle form submission
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(form),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Something went wrong');
            }
            
            // Use timeout for a smooth transition
            const timeoutId = window.setTimeout(() => {
                setIsSubmitted(true);
                setForm({ name: "", email: "", message: "" });
                setErrors({});
                setSubmissionTimeoutId(null);
            }, 500);
            
            setSubmissionTimeoutId(timeoutId);
        } catch (error) {
            console.error("Form submission error", error);
            setGeneralError(
                error instanceof Error 
                    ? error.message 
                    : dictionary.contact.submissionError
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="mx-auto border-0 shadow">
            <Card.Body className="p-3 p-md-4">
                {isSubmitted ? (
                    <Alert variant="success">
                        {dictionary.contact.successMessage}
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
                                {dictionary.contact.name}
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
                                {dictionary.contact.email}
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
                                {dictionary.contact.message}
                            </Form.Label>
                            <Form.Control
                                as="textarea"
                                id="message"
                                name="message"
                                value={form.message}
                                onChange={handleChange}
                                placeholder={dictionary.contact.placeholderMessage}
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
                            className="w-100 bg-brand-gradient"
                            disabled={isSubmitting}
                            aria-busy={isSubmitting ? "true" : "false"}
                            aria-live="polite"
                        >
                            {isSubmitting ? (
                                <span className="d-flex align-items-center justify-content-center">
                                    <Spinner animation="border" size="sm" className="me-2" />
                                    {dictionary.contact.submitting}
                                </span>
                            ) : (
                                <span className="d-flex align-items-center justify-content-center">
                                    <i className="bi bi-send me-2"></i>
                                    {dictionary.contact.submit}
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