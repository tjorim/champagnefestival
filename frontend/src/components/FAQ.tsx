import React from "react";
import Accordion from "react-bootstrap/Accordion";

import { useFaq } from "@/hooks/useFaq";
import { m } from "@/paraglide/messages";

/**
 * FAQ component that displays a list of frequently asked questions
 * with expandable/collapsible answers in an accessible accordion pattern.
 *
 * Content is admin-editable (`/api/faq/active`) rather than hardcoded per
 * locale, since answers like festival dates change every edition.
 */
const FAQ: React.FC = () => {
  const { items, isLoaded } = useFaq();

  if (isLoaded && items.length === 0) {
    return <p className="text-secondary text-center mb-0">{m.faq_empty()}</p>;
  }

  return (
    <Accordion className="rounded-lg shadow-lg">
      {items.map((item) => (
        <Accordion.Item key={item.id} eventKey={item.id}>
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
