"use client";

import { useMemo } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      data-tailwind-migrated="true"
      className={cn("tw:flex tw:flex-col tw:gap-6", className)}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-tailwind-migrated="true"
      data-variant={variant}
      className={cn("tw:mb-3 tw:font-medium", className)}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      data-tailwind-migrated="true"
      className={cn(
        "tw:group/field-group tw:@container/field-group tw:flex tw:w-full tw:flex-col tw:gap-7",
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva("tw:group/field tw:flex tw:w-full tw:gap-3", {
  variants: {
    orientation: {
      vertical: "tw:flex-col tw:*:w-full",
      horizontal: "tw:flex-row tw:items-center",
      responsive:
        "tw:flex-col tw:*:w-full tw:@md/field-group:flex-row tw:@md/field-group:items-center tw:@md/field-group:*:w-auto",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-tailwind-migrated="true"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      data-tailwind-migrated="true"
      className={cn(
        "tw:group/field-content tw:flex tw:flex-1 tw:flex-col tw:gap-1 tw:leading-snug",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      data-tailwind-migrated="true"
      className={cn(
        "tw:group/field-label tw:peer/field-label tw:flex tw:w-fit tw:gap-2 tw:leading-snug tw:has-data-checked:border-primary/30 tw:has-data-checked:bg-primary/5 tw:dark:has-data-checked:border-primary/20 tw:dark:has-data-checked:bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      data-tailwind-migrated="true"
      className={cn(
        "tw:flex tw:w-fit tw:items-center tw:gap-2 tw:text-sm tw:font-medium",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      data-tailwind-migrated="true"
      className={cn(
        "tw:text-left tw:text-sm tw:leading-normal tw:font-normal tw:text-muted-foreground tw:group-has-data-horizontal/field:text-balance",
        "tw:last:mt-0 tw:nth-last-2:-mt-1",
        "  ",
        className,
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-tailwind-migrated="true"
      data-content={!!children}
      className={cn("tw:relative tw:-my-2 tw:h-5 tw:text-sm", className)}
      {...props}
    >
      <Separator className="tw:absolute tw:inset-0 tw:top-1/2" />
      {children && (
        <span
          className="tw:relative tw:mx-auto tw:block tw:w-fit tw:bg-background tw:px-2 tw:text-muted-foreground"
          data-slot="field-separator-content"
          data-tailwind-migrated="true"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [...new Map(errors.map((error) => [error?.message, error])).values()];

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="tw:ml-4 tw:flex tw:list-disc tw:flex-col tw:gap-1">
        {uniqueErrors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      data-tailwind-migrated="true"
      className={cn("tw:text-sm tw:font-normal tw:text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
