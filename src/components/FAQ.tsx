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
        <Accordion className="rounded-lg shadow-lg">
            {faqData.map((faq, index) => (
                <Accordion.Item 
                    key={index}
                    eventKey={`${index}`}
                    className="border-dark"
                >
                    <Accordion.Header>
                        {faq.question}
                    </Accordion.Header>
                    <Accordion.Body>
                        <div className="py-2 border-start border-3 ps-3" style={{ borderColor: "#a16efa" }}>
                            <p>{faq.answer}</p>
                        </div>
                    </Accordion.Body>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default FAQ;