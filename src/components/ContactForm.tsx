import React, { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { User, Mail, MessageSquare, Send, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Form data structure
 */
interface FormData {
    name: string;
    email: string;
    message: string;
}

/**
 * Contact form component with validation using shadcn UI components
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
        <Card className="max-w-2xl mx-auto">
            <CardContent className="p-6">
                {isSubmitted ? (
                    <div className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 p-4 rounded-lg" role="alert">
                        {t("contact.successMessage", "Thank you for your message! We'll get back to you soon.")}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {generalError && (
                            <div className="text-destructive flex items-center gap-2 mb-4 p-2 bg-destructive/10 rounded-md">
                                <AlertCircle className="h-5 w-5" />
                                <span>{generalError}</span>
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            <Label htmlFor="name">
                                {t("contact.name", "Your Name")}
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                                    <User className="h-4 w-4" />
                                </span>
                                <Input
                                    id="name"
                                    name="name"
                                    value={form.name}
                                    onChange={handleChange}
                                    className={cn(
                                        "pl-10",
                                        errors.name && "border-destructive focus-visible:ring-destructive"
                                    )}
                                    disabled={isSubmitting}
                                    required
                                />
                            </div>
                            {errors.name && (
                                <p className="text-sm text-destructive">{errors.name}</p>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="email">
                                {t("contact.email", "Your Email")}
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                                    <Mail className="h-4 w-4" />
                                </span>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={form.email}
                                    onChange={handleChange}
                                    className={cn(
                                        "pl-10",
                                        errors.email && "border-destructive focus-visible:ring-destructive"
                                    )}
                                    disabled={isSubmitting}
                                    required
                                />
                            </div>
                            {errors.email && (
                                <p className="text-sm text-destructive">{errors.email}</p>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="message">
                                {t("contact.message", "Your Message")}
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-4 text-muted-foreground">
                                    <MessageSquare className="h-4 w-4" />
                                </span>
                                <Textarea
                                    id="message"
                                    name="message"
                                    value={form.message}
                                    onChange={handleChange}
                                    className={cn(
                                        "pl-10 min-h-[120px]",
                                        errors.message && "border-destructive focus-visible:ring-destructive"
                                    )}
                                    disabled={isSubmitting}
                                    required
                                />
                            </div>
                            {errors.message && (
                                <p className="text-sm text-destructive">{errors.message}</p>
                            )}
                        </div>
                        
                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    {t("contact.submitting", "Sending...")}
                                </span>
                            ) : (
                                <span className="flex items-center">
                                    <Send className="h-4 w-4 mr-2" />
                                    {t("contact.submit", "Send Message")}
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
