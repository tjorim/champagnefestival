/**
 * FAQ configuration — IDs for the five Q&A pairs.
 * The corresponding messages are `faq_q{n}` / `faq_a{n}` in the Paraglide message catalogue.
 */
export const faqIds = [1, 2, 3, 4, 5] as const;
export type FaqId = (typeof faqIds)[number];
