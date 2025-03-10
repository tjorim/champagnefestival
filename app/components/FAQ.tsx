'use client';

import React from "react";
import { Accordion } from "react-bootstrap";
import { useTranslations } from "next-intl";

/**
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern
 * Using react-bootstrap accordion
 */
const FAQ: React.FC = () => {
    const t = useTranslations('faq');
    
    // Create 5 FAQ items directly using the translations
    const faqs = [
        { id: 1, key: 'q1', answerKey: 'a1' },
        { id: 2, key: 'q2', answerKey: 'a2' },
        { id: 3, key: 'q3', answerKey: 'a3' },
        { id: 4, key: 'q4', answerKey: 'a4' },
        { id: 5, key: 'q5', answerKey: 'a5' }
    ];
    
    return (
        <Accordion className="rounded-lg shadow-lg">
            {faqs.map((faq) => (
                <Accordion.Item
                    key={faq.id}
                    eventKey={`${faq.id}`}
                >
                    <Accordion.Header>
                        {t(faq.key)}
                    </Accordion.Header>
                    <Accordion.Body>
                        <div className="py-2 border-start border-3 ps-3 border-brand">
                            <p>{t(faq.answerKey)}</p>
                        </div>
                    </Accordion.Body>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default FAQ;