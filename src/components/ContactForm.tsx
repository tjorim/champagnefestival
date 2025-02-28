import React, { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import * as Form from '@radix-ui/react-form';
import { EnvelopeIcon, UserIcon, ChatBubbleBottomCenterTextIcon, PaperAirplaneIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";

/**
 * Form data structure
 */
interface FormData {
    name: string;
    email: string;
    message: string;
}

/**
 * Contact form component with validation using Radix UI Form
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
        <div className="contact-form-container bg-darkCard rounded-lg p-6 shadow-lg max-w-2xl mx-auto">
            {isSubmitted ? (
                <div className="form-success bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 p-4 rounded-lg" role="alert">
                    {t("contact.successMessage", "Thank you for your message! We'll get back to you soon.")}
                </div>
            ) : (
                <>
                    {generalError && (
                        <div className="text-red-500 flex items-center gap-2 mb-4 p-2 bg-red-50 rounded-md">
                            <ExclamationCircleIcon className="h-5 w-5" />
                            <span>{generalError}</span>
                        </div>
                    )}
                    <Form.Root onSubmit={handleSubmit} className="space-y-6">
                        <Form.Field name="name" className="form-group">
                            <div className="flex items-baseline justify-between mb-2">
                                <Form.Label className="form-label font-medium">
                                    {t("contact.name", "Your Name")}
                                </Form.Label>
                                <Form.Message className="text-red-500 text-sm" match="valueMissing">
                                    {t("contact.errors.nameRequired", "Name is required")}
                                </Form.Message>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                                    <UserIcon className="h-3 w-3" />
                                </span>
                                <Form.Control asChild>
                                    <input
                                        type="text"
                                        name="name"
                                        value={form.name}
                                        onChange={handleChange}
                                        className="w-full p-3 pl-10 bg-opacity-10 bg-white dark:bg-gray-800 rounded-md border border-gray-600 dark:border-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
                                        disabled={isSubmitting}
                                        required
                                    />
                                </Form.Control>
                            </div>
                        </Form.Field>

                        <Form.Field name="email" className="form-group">
                            <div className="flex items-baseline justify-between mb-2">
                                <Form.Label className="form-label font-medium">
                                    {t("contact.email", "Your Email")}
                                </Form.Label>
                                <Form.Message className="text-red-500 text-sm" match="valueMissing">
                                    {t("contact.errors.emailRequired", "Email is required")}
                                </Form.Message>
                                <Form.Message className="text-red-500 text-sm" match="typeMismatch">
                                    {t("contact.errors.emailInvalid", "Please enter a valid email address")}
                                </Form.Message>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                                    <EnvelopeIcon className="h-3 w-3" />
                                </span>
                                <Form.Control asChild>
                                    <input
                                        type="email"
                                        name="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        className="w-full p-3 pl-10 bg-opacity-10 bg-white dark:bg-gray-800 rounded-md border border-gray-600 dark:border-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
                                        disabled={isSubmitting}
                                        required
                                    />
                                </Form.Control>
                            </div>
                        </Form.Field>

                        <Form.Field name="message" className="form-group">
                            <div className="flex items-baseline justify-between mb-2">
                                <Form.Label className="form-label font-medium">
                                    {t("contact.message", "Your Message")}
                                </Form.Label>
                                <Form.Message className="text-red-500 text-sm" match="valueMissing">
                                    {t("contact.errors.messageRequired", "Message is required")}
                                </Form.Message>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-6 transform -translate-y-1/2 text-gray-400">
                                    <ChatBubbleBottomCenterTextIcon className="h-3 w-3" />
                                </span>
                                <Form.Control asChild>
                                    <textarea
                                        name="message"
                                        value={form.message}
                                        onChange={handleChange}
                                        className="w-full p-3 pl-10 bg-opacity-10 bg-white dark:bg-gray-800 rounded-md border border-gray-600 dark:border-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm min-h-[120px]"
                                        disabled={isSubmitting}
                                        required
                                    ></textarea>
                                </Form.Control>
                            </div>
                        </Form.Field>

                        <Form.Submit asChild>
                            <button
                                type="submit"
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-8 rounded-md hover:from-indigo-700 hover:to-purple-700 transition-all font-medium shadow-lg hover:shadow-indigo-500/30 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-70 w-full flex items-center justify-center"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t("contact.submitting", "Sending...")}
                                    </span>
                                ) : (
                                    <span className="flex items-center">
                                        <PaperAirplaneIcon className="h-3 w-3 mr-2" />
                                        {t("contact.submit", "Send Message")}
                                    </span>
                                )}
                            </button>
                        </Form.Submit>
                    </Form.Root>
                </>
            )}
        </div >
    );
};

export default ContactForm;
