"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";

import { AdminThemeScope } from "@/components/admin/AdminThemeScope";
import { Button } from "@/components/ui/button";

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "tw:fixed tw:inset-0 tw:isolate tw:z-dialog tw:bg-foreground/50 tw:duration-100 tw:supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  admin = false,
  onBackdropClick,
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  onBackdropClick?: () => void;
  admin?: boolean;
  size?: "default" | "sm";
}) {
  const content = (
    <>
      <AlertDialogOverlay onClick={onBackdropClick} />
      <AlertDialogPrimitive.Viewport
        className="tw:fixed tw:inset-0 tw:z-dialog tw:flex tw:flex-col tw:items-center tw:overflow-y-auto tw:p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) onBackdropClick?.();
        }}
      >
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          data-tailwind-migrated="true"
          data-size={size}
          className={cn(
            "tw:relative tw:z-dialog tw:my-auto tw:grid tw:w-full tw:max-w-lg tw:gap-4 tw:rounded-xl tw:border tw:border-border tw:bg-popover tw:p-6 tw:text-popover-foreground tw:shadow-lg tw:outline-none",
            className,
          )}
          {...props}
        />
      </AlertDialogPrimitive.Viewport>
    </>
  );
  return (
    <AlertDialogPortal>
      {admin ? <AdminThemeScope>{content}</AdminThemeScope> : content}
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-dialog-header" className={cn("tw:grid tw:gap-2", className)} {...props} />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "tw:flex tw:flex-col-reverse tw:gap-2 tw:group-data-[size=sm]/alert-dialog-content:grid tw:group-data-[size=sm]/alert-dialog-content:grid-cols-2 tw:sm:flex-row tw:sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "tw:mb-2 tw:inline-flex tw:size-16 tw:items-center tw:justify-center tw:rounded-md tw:bg-muted tw:sm:group-data-[size=default]/alert-dialog-content:row-span-2 tw:*:[svg:not([class*=size-])]:size-8",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "tw:m-0 tw:text-lg tw:font-medium tw:sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "tw:text-sm tw:text-balance tw:text-muted-foreground tw:md:text-pretty tw:*:[a]:underline tw:*:[a]:underline-offset-3 tw:*:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" className={cn(className)} {...props} />;
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
