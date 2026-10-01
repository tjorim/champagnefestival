import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, type ComponentProps, type ReactElement } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "tw:group/button tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:border tw:border-transparent tw:bg-transparent tw:bg-clip-padding tw:text-sm tw:text-foreground tw:font-medium tw:whitespace-nowrap tw:transition-all tw:outline-none tw:select-none tw:focus-visible:border-ring tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50 tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:ring-3 tw:aria-invalid:ring-destructive/20 tw:dark:aria-invalid:border-destructive/50 tw:dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default: "tw:bg-primary tw:text-primary-foreground tw:hover:bg-primary/80",
        warning:
          "tw:bg-warning tw:text-warning-foreground tw:hover:bg-warning/80 tw:focus-visible:border-warning/40 tw:focus-visible:ring-warning/20",
        outline:
          "tw:border-border tw:bg-background tw:shadow-xs tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground tw:dark:border-input tw:dark:bg-input/30 tw:dark:hover:bg-input/50",
        secondary:
          "tw:bg-secondary tw:text-secondary-foreground tw:aria-expanded:bg-secondary tw:aria-expanded:text-secondary-foreground",
        ghost:
          "tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground tw:dark:hover:bg-muted/50",
        destructive:
          "tw:bg-destructive/10 tw:text-destructive tw:hover:bg-destructive/20 tw:focus-visible:border-destructive/40 tw:focus-visible:ring-destructive/20 tw:dark:bg-destructive/20 tw:dark:hover:bg-destructive/30 tw:dark:focus-visible:ring-destructive/40",
        link: "tw:text-primary tw:underline-offset-4 tw:hover:underline",
        danger:
          "tw:bg-destructive tw:text-inverse tw:hover:bg-destructive/80 tw:focus-visible:border-destructive/40 tw:focus-visible:ring-destructive/30",
        success:
          "tw:bg-success tw:text-inverse tw:hover:bg-success/80 tw:focus-visible:border-success/40 tw:focus-visible:ring-success/30",
        info: "tw:bg-info tw:text-contrast tw:hover:bg-info/80 tw:focus-visible:border-info/40 tw:focus-visible:ring-info/30",
        "outline-primary":
          "tw:border-primary tw:text-primary tw:hover:bg-primary tw:hover:text-primary-foreground",
        "outline-warning":
          "tw:border-warning tw:text-warning tw:hover:bg-warning tw:hover:text-warning-foreground tw:focus-visible:ring-warning/30",
        "outline-danger":
          "tw:border-destructive tw:text-destructive tw:hover:bg-destructive tw:hover:text-inverse tw:focus-visible:ring-destructive/30",
        "outline-success":
          "tw:border-success tw:text-success tw:hover:bg-success tw:hover:text-inverse tw:focus-visible:ring-success/30",
        "outline-info":
          "tw:border-info tw:text-info tw:hover:bg-info tw:hover:text-contrast tw:focus-visible:ring-info/30",
        brand: "tw:bg-primary tw:text-inverse tw:border-0 tw:hover:bg-primary/80 tw:font-bold",
        light:
          "tw:border-inverse/40 tw:text-inverse tw:hover:bg-inverse tw:hover:text-contrast tw:focus-visible:ring-inverse/30",
      },
      size: {
        default: "tw:h-9 tw:gap-1.5 tw:px-2.5",
        xs: "tw:h-6 tw:gap-1 tw:px-2 tw:text-xs",
        sm: "tw:h-8 tw:gap-1 tw:px-2.5",
        lg: "tw:h-10 tw:gap-1.5 tw:px-2.5",
        icon: "tw:size-9",
        "icon-xs": "tw:size-6",
        "icon-sm": "tw:size-8",
        "icon-lg": "tw:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-tailwind-migrated="true"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

/**
 * Link with button styling. Renders a real `<a>` (or the element passed as
 * `render`, e.g. a router `<Link>`) so it keeps link semantics; Button is for
 * actions.
 */
function ButtonLink({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: ComponentProps<"a"> &
  VariantProps<typeof buttonVariants> & { render?: ReactElement<ComponentProps<"a">> }) {
  const merged = {
    "data-slot": "button",
    "data-variant": variant,
    "data-size": size,
    "data-tailwind-migrated": "true",
    className: cn("tw:no-underline", buttonVariants({ variant, size, className })),
    ...props,
  };
  return render ? cloneElement(render, merged) : <a {...merged} />;
}

export { Button, ButtonLink, buttonVariants };
