import { Accordion as Primitive } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
function Accordion(props: Primitive.Root.Props) {
  return <Primitive.Root data-tailwind-migrated="true" data-slot="accordion" {...props} />;
}
function AccordionItem({ className, ...props }: Primitive.Item.Props) {
  return <Primitive.Item data-slot="accordion-item" className={cn(className)} {...props} />;
}
function AccordionTrigger({ className, children, ...props }: Primitive.Trigger.Props) {
  return (
    <Primitive.Header className="tw:m-0">
      <Primitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-3 tw:text-left tw:focus-visible:outline-2 tw:focus-visible:outline-ring",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown aria-hidden="true" className="tw:size-4 tw:shrink-0" />
      </Primitive.Trigger>
    </Primitive.Header>
  );
}
function AccordionContent({ className, ...props }: Primitive.Panel.Props) {
  return <Primitive.Panel data-slot="accordion-content" className={cn(className)} {...props} />;
}
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
