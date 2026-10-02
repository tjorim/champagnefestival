import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, type ComponentProps, type ReactElement } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent bg-clip-padding text-sm text-foreground font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        warning:
          "bg-warning text-warning-foreground hover:bg-warning/80 focus-visible:border-warning/40 focus-visible:ring-warning/20",
        outline:
          "border-border bg-background shadow-xs hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        danger:
          "bg-destructive text-inverse hover:bg-destructive/80 focus-visible:border-destructive/40 focus-visible:ring-destructive/30",
        success:
          "bg-success text-inverse hover:bg-success/80 focus-visible:border-success/40 focus-visible:ring-success/30",
        info: "bg-info text-contrast hover:bg-info/80 focus-visible:border-info/40 focus-visible:ring-info/30",
        "outline-primary":
          "border-primary text-primary hover:bg-primary hover:text-primary-foreground",
        "outline-warning":
          "border-warning text-warning hover:bg-warning hover:text-warning-foreground focus-visible:ring-warning/30",
        "outline-danger":
          "border-destructive text-destructive hover:bg-destructive hover:text-inverse focus-visible:ring-destructive/30",
        "outline-success":
          "border-success text-success hover:bg-success hover:text-inverse focus-visible:ring-success/30",
        "outline-info":
          "border-info text-info hover:bg-info hover:text-contrast focus-visible:ring-info/30",
        brand: "bg-primary text-inverse border-0 hover:bg-primary/80 font-bold",
        light:
          "border-inverse/40 text-inverse hover:bg-inverse hover:text-contrast focus-visible:ring-inverse/30",
      },
      size: {
        default: "h-9 gap-1.5 px-2.5",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-8 gap-1 px-2.5",
        lg: "h-10 gap-1.5 px-2.5",
        icon: "size-9",
        "icon-xs": "size-6",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
    className: cn("no-underline", buttonVariants({ variant, size, className })),
    ...props,
  };
  return render ? cloneElement(render, merged) : <a {...merged} />;
}

export { Button, ButtonLink, buttonVariants };
