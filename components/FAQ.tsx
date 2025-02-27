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
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern
 */
const FAQ: React.FC = () => {
    const { t } = useTranslation();
    
    // FAQ content - in a real app, this might come from props or an API
    const faqData: FAQItem[] = [
        {
            question: t("faq.q1", "What is the Champagne Festival about?"),
            answer: t("faq.a1", "The Champagne Festival is a celebration of fine champagne, bringing together producers, enthusiasts, and the community for tastings, workshops, and social events."),
        },
        {
            question: t("faq.q2", "When is the next festival?"),
            answer: t("faq.a2", "The next festival is scheduled for March 7-9, 2025. Mark your calendars for a weekend of bubbles and festivities!"),
        },
        {
            question: t("faq.q3", "Where will the festival be held?"),
            answer: t("faq.a3", "The festival will take place at the Grand Exhibition Hall in the city center. There's convenient public transportation and parking nearby."),
        },
        {
            question: t("faq.q4", "Are tickets available yet?"),
            answer: t("faq.a4", "Early bird tickets will be available starting September 2024. Sign up for our newsletter to be notified when tickets go on sale."),
        },
        {
            question: t("faq.q5", "Can I become a sponsor or vendor?"),
            answer: t("faq.a5", "Yes! We welcome partnerships with businesses related to champagne, food, and luxury lifestyle. Please use our contact form to express your interest."),
        },
    ];

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
                            className={`w-full py-4 px-6 text-left flex items-center justify-between transition-colors rounded-lg ${
                                openIndex === index 
                                    ? 'bg-indigo-500/10 text-white' 
                                    : 'hover:bg-gray-800/70 text-gray-200'
                            }`}
                            id={`faq-question-${index}`}
                        >
                            <span className="font-medium">{faq.question}</span>
                            <ChevronDownIcon 
                                className={`h-3 w-3 text-indigo-400 transition-transform duration-300 ${
                                    openIndex === index ? 'transform rotate-180' : ''
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
