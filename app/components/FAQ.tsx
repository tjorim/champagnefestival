// A basic FAQ component with toggling answers.

import React, { useState } from "react";

const FAQ = () => {
    const faqData = [
        {
            question: "What is the festival about?",
            answer: "It is a celebration of champagne and community.",
        },
        {
            question: "When is the next festival?",
            answer: "The next festival is scheduled for March 2025.",
        },
        // Add more FAQs as needed.
    ];

    const [openIndex, setOpenIndex] = useState(null);

    const toggleFAQ = (index) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="faq">
            {faqData.map((faq, index) => (
                <div key={index} className="faq-item">
                    <h4 onClick={() => toggleFAQ(index)}>{faq.question}</h4>
                    {openIndex === index && <p>{faq.answer}</p>}
                </div>
            ))}
        </div>
    );
};

export default FAQ;
