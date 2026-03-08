import React from "react";
import Accordion from "react-bootstrap/Accordion";

import { m } from "../paraglide/messages";
import type { FaqId } from "../config/faq";

/**
 * Returns the translated question and answer for the given FAQ ID.
 */
function getFaqItem(id: FaqId): { question: string; answer: string } {
  switch (id) {
    case 1:
      return { question: m.faq_q1(), answer: m.faq_a1() };
    case 2:
      return { question: m.faq_q2(), answer: m.faq_a2() };
    case 3:
      return { question: m.faq_q3(), answer: m.faq_a3() };
    case 4:
      return { question: m.faq_q4(), answer: m.faq_a4() };
    case 5:
      return { question: m.faq_q5(), answer: m.faq_a5() };
  }
}

/**
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern.
 */
const FAQ: React.FC<{ ids?: readonly FaqId[] }> = ({ ids = [1, 2, 3, 4, 5] }) => {
  const faqItems = ids.map((id) => ({ id, ...getFaqItem(id) }));

  return (
    <Accordion className="rounded-lg shadow-lg">
      {faqItems.map((item) => (
        <Accordion.Item key={item.id} eventKey={`${item.id}`}>
          <Accordion.Header>{item.question}</Accordion.Header>
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
