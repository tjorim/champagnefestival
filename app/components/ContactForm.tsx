import React, { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";

/**
 * Form data structure
 */
interface FormData {
    name: string;
    email: string;
    message: string;
}

/**
 * Form validation errors
 */
interface FormErrors {
    name?: string;
    email?: string;
    message?: string;
}

/**
 * Contact form component with validation
 */
const ContactForm: React.FC = () => {
    const { t } = useTranslation();
    const [form, setForm] = useState<FormData>({ name: "", email: "", message: "" });
    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    // Handle form field changes
    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value });
        
        // Clear error when user starts typing
        if (errors[name as keyof FormErrors]) {
            setErrors({
                ...errors,
                [name]: undefined
            });
        }
    };

    // Validate form inputs
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};
        
        // Name validation
        if (!form.name.trim()) {
            newErrors.name = t("contact.errors.nameRequired", "Name is required");
        }
        
        // Email validation
        if (!form.email.trim()) {
            newErrors.email = t("contact.errors.emailRequired", "Email is required");
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            newErrors.email = t("contact.errors.emailInvalid", "Please enter a valid email address");
        }
        
        // Message validation
        if (!form.message.trim()) {
            newErrors.message = t("contact.errors.messageRequired", "Message is required");
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        // Validate form before submission
        if (!validateForm()) return;
        
        setIsSubmitting(true);
        
        try {
            // Simulate API call (replace with actual API call in real app)
            await new Promise(resolve => setTimeout(resolve, 1000));
            setIsSubmitted(true);
            setForm({ name: "", email: "", message: "" });
        } catch (error) {
            console.error("Form submission error", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="contact-form-container">
            {isSubmitted ? (
                <div className="form-success" role="alert">
                    {t("contact.successMessage", "Thank you for your message! We'll get back to you soon.")}
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="contact-form" noValidate>
                    <div className="form-group">
                        <label htmlFor="name" className="form-label">
                            {t("contact.name", "Your Name")}
                        </label>
                        <input
                            id="name"
                            type="text"
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            className={errors.name ? "form-input error" : "form-input"}
                            aria-invalid={errors.name ? "true" : "false"}
                            aria-describedby={errors.name ? "name-error" : undefined}
                            disabled={isSubmitting}
                            required
                        />
                        {errors.name && (
                            <div id="name-error" className="error-message" role="alert">
                                {errors.name}
                            </div>
                        )}
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">
                            {t("contact.email", "Your Email")}
                        </label>
                        <input
                            id="email"
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={handleChange}
                            className={errors.email ? "form-input error" : "form-input"}
                            aria-invalid={errors.email ? "true" : "false"}
                            aria-describedby={errors.email ? "email-error" : undefined}
                            disabled={isSubmitting}
                            required
                        />
                        {errors.email && (
                            <div id="email-error" className="error-message" role="alert">
                                {errors.email}
                            </div>
                        )}
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="message" className="form-label">
                            {t("contact.message", "Your Message")}
                        </label>
                        <textarea
                            id="message"
                            name="message"
                            value={form.message}
                            onChange={handleChange}
                            className={errors.message ? "form-input error" : "form-input"}
                            aria-invalid={errors.message ? "true" : "false"}
                            aria-describedby={errors.message ? "message-error" : undefined}
                            disabled={isSubmitting}
                            required
                        ></textarea>
                        {errors.message && (
                            <div id="message-error" className="error-message" role="alert">
                                {errors.message}
                            </div>
                        )}
                    </div>
                    
                    <button 
                        type="submit" 
                        className="submit-button"
                        disabled={isSubmitting}
                    >
                        {isSubmitting 
                            ? t("contact.submitting", "Sending...") 
                            : t("contact.submit", "Send Message")}
                    </button>
                </form>
            )}
        </div>
    );
};

export default ContactForm;
