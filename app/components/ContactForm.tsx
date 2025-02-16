// A simple contact form that (for now) simply alerts on submit.

import React, { useState } from "react";

const ContactForm = () => {
    const [form, setForm] = useState({ name: "", email: "", message: "" });

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // In a real app, submit the data to a backend or service like Formspree.
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
