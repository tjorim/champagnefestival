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
    ];

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="faq">
            {faqData.map((faq, index) => (
                <div key={index} className="faq-item">
                    <button
                        onClick={() => toggleFAQ(index)}
                        aria-expanded={openIndex === index}
                        aria-controls={`faq-answer-${index}`}
                        className="faq-question"
                    >
                        {faq.question}
                    </button>
                    {openIndex === index && (
                        <p id={`faq-answer-${index}`} className="faq-answer">
                            {faq.answer}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
};

export default FAQ;
