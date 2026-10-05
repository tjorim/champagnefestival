import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function PresentationList({
  className,
  flush,
  ...props
}: ComponentProps<"ul"> & { flush?: boolean }) {
  return (
    <ul
      data-slot="presentation-list"
      data-flush={flush || undefined}
      className={cn("m-0 flex list-none flex-col p-0", className)}
      {...props}
    />
  );
}
function PresentationListItem({
  className,
  action,
  children,
  ...props
}: (ComponentProps<"button"> & { action: true }) | (ComponentProps<"li"> & { action?: false })) {
  if (action) {
    return (
      <li className="list-none">
        <button
          data-slot="presentation-list-item"
          type="button"
          className={cn(
            "w-full text-left cursor-pointer hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
            className,
          )}
          {...(props as ComponentProps<"button">)}
        >
          {children}
        </button>
      </li>
    );
  }
  return (
    <li
      data-slot="presentation-list-item"
      className={cn("relative block", className)}
      {...(props as ComponentProps<"li">)}
    >
      {children}
    </li>
  );
}
export { PresentationList, PresentationListItem };
