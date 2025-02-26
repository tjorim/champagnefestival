import React, { useState } from "react";

/**
 * FAQ item structure
 */
interface FAQItem {
    question: string;
    answer: string;
}

/**
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern
 */
const FAQ: React.FC = () => {
    // FAQ content - in a real app, this might come from props or an API
    const faqData: FAQItem[] = [
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

    const toggleFAQ = (index: number): void => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="faq" role="region" aria-label="Frequently Asked Questions">
            {faqData.map((faq, index) => (
                <div key={index} className="faq-item">
                    <h3 className="faq-heading">
                        <button
                            onClick={() => toggleFAQ(index)}
                            aria-expanded={openIndex === index}
                            aria-controls={`faq-answer-${index}`}
                            className="faq-question"
                            id={`faq-question-${index}`}
                        >
                            {faq.question}
                            <span className="faq-icon" aria-hidden="true">
                                {openIndex === index ? '−' : '+'}
                            </span>
                        </button>
                    </h3>
                    <div 
                        id={`faq-answer-${index}`} 
                        role="region"
                        aria-labelledby={`faq-question-${index}`}
                        className={`faq-answer-container ${openIndex === index ? 'open' : ''}`}
                    >
                        {/* Always render the answer but hide it with CSS when not active */}
                        <div className="faq-answer">
                            <p>{faq.answer}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default FAQ;
