import React from "react";
import { useTranslation } from "react-i18next";
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDownIcon } from '@heroicons/react/24/solid';

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
 */
const FAQ: React.FC<FAQProps> = ({ faqItems = [] }) => {
    const { t } = useTranslation();

    // Transform config items to displayable items with translations
    const faqData = faqItems?.map(item => ({
        question: t(item.question.labelKey, item.question.defaultLabel),
        answer: t(item.answer.labelKey, item.answer.defaultLabel)
    })) || [];

    return (
        <Accordion.Root
            type="single"
            collapsible
            className="w-full rounded-lg overflow-hidden shadow-lg"
        >
            {faqData.map((faq, index) => (
                <Accordion.Item 
                    key={index}
                    value={`item-${index}`}
                    className="border-b border-gray-800 last:border-b-0 overflow-hidden"
                >
                    <Accordion.Header className="w-full">
                        <Accordion.Trigger className="w-full py-4 px-6 flex items-center justify-between gap-4 text-left bg-darkCard hover:bg-gray-800/50 transition-colors group">
                            <span className="font-medium text-gray-200">{faq.question}</span>
                            <ChevronDownIcon 
                                className="h-5 w-5 flex-shrink-0 text-indigo-400 transition-transform duration-300 group-data-[state=open]:rotate-180" 
                                aria-hidden 
                            />
                        </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Content className="overflow-hidden bg-darkCard/50 data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
                        <div className="px-6 py-4 text-gray-300 border-l-2 border-indigo-500/30 ml-6 mb-2">
                            <p>{faq.answer}</p>
                        </div>
                    </Accordion.Content>
                </Accordion.Item>
            ))}
        </Accordion.Root>
    );
};

export default FAQ;