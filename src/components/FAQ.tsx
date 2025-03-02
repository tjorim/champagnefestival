import React from "react";
import { useTranslation } from "react-i18next";
import { Accordion } from "react-bootstrap";

/**
 * FAQ item structure from config
 */
interface FAQConfigItem {
    question: {
        labelKey: string;
        defaultLabel: string;
    };
    answer: {
        labelKey: string;
        defaultLabel: string;
    };
}

/**
 * Props for the FAQ component
 */
interface FAQProps {
    faqItems?: FAQConfigItem[];
}

/**
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern
 * Using react-bootstrap accordion
 */
const FAQ: React.FC<FAQProps> = ({ faqItems = [] }) => {
    const { t } = useTranslation();

    // Transform config items to displayable items with translations
    const faqData = faqItems?.map(item => ({
        question: t(item.question.labelKey, item.question.defaultLabel),
        answer: t(item.answer.labelKey, item.answer.defaultLabel)
    })) || [];

    return (
        <Accordion className="w-full rounded-lg overflow-hidden shadow-lg">
            {faqData.map((faq, index) => (
                <Accordion.Item 
                    key={index}
                    eventKey={`${index}`}
                    className="border-b border-neutral-800 overflow-hidden"
                >
                    <Accordion.Header className="px-6 py-4 hover:bg-neutral-800/50 text-gray-200 hover:text-white">
                        {faq.question}
                    </Accordion.Header>
                    <Accordion.Body className="bg-neutral-900/50 px-6 text-gray-300">
                        <div className="py-4 border-l-2 border-indigo-500/30 pl-4">
                            <p>{faq.answer}</p>
                        </div>
                    </Accordion.Body>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default FAQ;