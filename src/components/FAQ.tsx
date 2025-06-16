import React from "react";
import { useTranslation } from "react-i18next";
import Accordion from "react-bootstrap/Accordion";
import { Dictionary } from "../types/i18n";

/**
 * FAQ component interface for keys prop
 */
interface FAQProps {
    // Array of keys that define which FAQ items to display
    keys?: Array<{
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
 * The component uses type-safe translations and handles dynamic date updates
 * through the i18n configuration.
 */
const FAQ: React.FC<FAQProps> = ({ keys = [] }) => {
    const { t } = useTranslation<keyof Dictionary['faq']>();

    // Map the translation keys to their values with fallbacks for better safety
    const faqItems = keys.map(item => ({
        id: item.id,
        question: t(`faq.${item.questionKey}`, {
            defaultValue: `Question ${item.id}`,
            ns: 'translation'
        }),
        answer: t(`faq.${item.answerKey}`, {
            defaultValue: `Answer to question ${item.id}`,
            ns: 'translation'
        })
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
                        <div className="py-2 border-start border-3 ps-3 border-brand text-start">
                            <p>{item.answer}</p>
                        </div>
                    </Accordion.Body>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default FAQ;