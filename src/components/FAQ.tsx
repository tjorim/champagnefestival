import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDownIcon } from '@heroicons/react/24/solid';

/**
 * FAQ item structure
 */
interface FAQItem {
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
 */
const FAQ: React.FC<FAQProps> = ({ items = [] }) => {
    const { t } = useTranslation();

    // Use props or imported data
    const faqData: FAQItem[] = items.length > 0 ? items : [];
    /*
    const faqData = items.map(item => ({
        ...item,
        label: t(link.labelKey, link.defaultLabel)
    }));
    */

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFAQ = (index: number): void => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="faq bg-darkCard rounded-lg overflow-hidden shadow-lg" role="region" aria-label="Frequently Asked Questions">
            {faqData.map((faq, index) => (
                <Collapsible.Root
                    key={index}
                    className="faq-item mb-4 last:mb-0"
                    open={openIndex === index}
                    onOpenChange={(open) => {
                        if (open) {
                            setOpenIndex(index);
                        } else {
                            setOpenIndex(null);
                        }
                    }}
                >
                    <Collapsible.Trigger asChild>
                        <button
                            className={`w-full py-4 px-6 text-left flex items-center justify-between transition-colors rounded-lg ${openIndex === index
                                    ? 'bg-indigo-500/10 text-white'
                                    : 'hover:bg-gray-800/70 text-gray-200'
                                }`}
                            id={`faq-question-${index}`}
                        >
                            <span className="font-medium">{faq.question}</span>
                            <ChevronDownIcon
                                className={`h-3 w-3 text-indigo-400 transition-transform duration-300 ${openIndex === index ? 'transform rotate-180' : ''
                                    }`}
                                aria-hidden="true"
                            />
                        </button>
                    </Collapsible.Trigger>

                    <Collapsible.Content className="transition-all duration-300 data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden">
                        <div className="px-6 py-4 text-gray-300 border-l-2 border-indigo-500/30 ml-6 mt-2">
                            <p>{faq.answer}</p>
                        </div>
                    </Collapsible.Content>
                </Collapsible.Root>
            ))}
        </div>
    );
};

export default FAQ;
