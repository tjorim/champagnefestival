'use client';

import React from "react";
import { Accordion } from "react-bootstrap";
import { useTranslations } from "next-intl";

/**
 * FAQ component interface for keys prop
 */
interface FAQProps {
  // Array of keys that define which FAQ items to display
  keys: Array<{
    id: number;
    questionKey: string;
    answerKey: string;
  }>;
}

/**
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern
 * Using react-bootstrap accordion
 * 
 * The component requires keys to be passed in, which define which FAQ items to display.
 * These keys correspond to translation keys in the dictionary files.
 */
const FAQ: React.FC<FAQProps> = ({ keys }) => {
    const t = useTranslations('faq');
    
    // Map the translation keys to their values with fallbacks for better safety
    const faqItems = keys.map(item => ({
        id: item.id,
        question: t(item.questionKey, { defaultValue: `Question ${item.id}` }),
        answer: t(item.answerKey, { defaultValue: `Answer to question ${item.id}` })
    }));
    
    return (
        <Accordion className="rounded-lg shadow-lg">
            {faqItems.map((item) => (
                <Accordion.Item
                    key={item.id}
                    eventKey={`${item.id}`}
                >
                    <Accordion.Header>
                        {item.question}
                    </Accordion.Header>
                    <Accordion.Body>
                        <div className="py-2 border-start border-3 ps-3 border-brand">
                            <p>{item.answer}</p>
                        </div>
                    </Accordion.Body>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default FAQ;