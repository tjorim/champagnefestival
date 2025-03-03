'use client';

import React from "react";
import { Accordion } from "react-bootstrap";

/**
 * FAQ item structure
 */
interface FAQItem {
    id: number;
    question: string;
    answer: string;
}

/**
 * Props for the FAQ component
 */
interface FAQProps {
    items?: FAQItem[];
}

/**
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern
 * Using react-bootstrap accordion
 */
const FAQ: React.FC<FAQProps> = ({ items = [] }) => {
    return (
        <Accordion className="rounded-lg shadow-lg">
            {items.map((faq) => (
                <Accordion.Item
                    key={faq.id}
                    eventKey={`${faq.id}`}
                >
                    <Accordion.Header>
                        {faq.question}
                    </Accordion.Header>
                    <Accordion.Body>
                        <div className="py-2 border-start border-3 ps-3 border-brand">
                            <p>{faq.answer}</p>
                        </div>
                    </Accordion.Body>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default FAQ;