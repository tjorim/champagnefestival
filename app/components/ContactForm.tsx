import React, { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

interface FormState {
    name: string;
    email: string;
    message: string;
}

const ContactForm: React.FC = () => {
    const [form, setForm] = useState<FormState>({ name: "", email: "", message: "" });

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // In a real app, submit the data to a backend or service.
        alert("Thank you for contacting us!");
        setForm({ name: "", email: "", message: "" });
    };

    return (
        <form onSubmit={handleSubmit} className="contact-form">
            <input
                type="text"
                name="name"
                placeholder="Your Name"
                value={form.name}
                onChange={handleChange}
                required
            />
            <input
                type="email"
                name="email"
                placeholder="Your Email"
                value={form.email}
                onChange={handleChange}
                required
            />
            <textarea
                name="message"
                placeholder="Your Message"
                value={form.message}
                onChange={handleChange}
                required
            />
            <button type="submit">Send</button>
        </form>
    );
};

export default ContactForm;
