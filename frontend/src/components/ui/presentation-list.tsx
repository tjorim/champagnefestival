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
      className={cn("tw:m-0 tw:flex tw:list-none tw:flex-col tw:p-0", className)}
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
      <li className="tw:list-none">
        <button
          data-slot="presentation-list-item"
          type="button"
          className={cn(
            "tw:w-full tw:text-left tw:cursor-pointer tw:hover:bg-muted tw:focus-visible:outline-2 tw:focus-visible:outline-ring tw:disabled:pointer-events-none tw:disabled:opacity-50",
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
      className={cn("tw:relative tw:block", className)}
      {...(props as ComponentProps<"li">)}
    >
      {children}
    </li>
  );
}
export { PresentationList, PresentationListItem };
