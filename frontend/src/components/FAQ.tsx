import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import Alert from "react-bootstrap/Alert";

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
  const { items, isLoaded, hasLoadError } = useFaq();

  if (hasLoadError) {
    return (
      <Alert variant="danger" className="text-center mb-0">
        {m.error_faq()}
      </Alert>
    );
  }

  if (isLoaded && items.length === 0) {
    return <p className="text-secondary text-center mb-0">{m.faq_empty()}</p>;
  }

  return (
    <Accordion className="tw:overflow-hidden">
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>
            <div className="tw:border-l-2 tw:border-primary tw:py-2 tw:pl-3 tw:text-left">
              <p>{item.answer}</p>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default FAQ;
