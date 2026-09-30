import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { AdminThemeScope } from "@/components/admin/AdminThemeScope";
import { m } from "@/paraglide/messages";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "tw:fixed tw:inset-0 tw:isolate tw:z-dialog tw:bg-foreground/50 tw:duration-100 tw:supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  admin = false,
  size = "default",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  admin?: boolean;
  size?: "default" | "sm" | "lg" | "xl";
}) {
  const content = (
    <>
      <DialogOverlay />
      <DialogPrimitive.Viewport className="tw:fixed tw:inset-0 tw:z-dialog tw:flex tw:flex-col tw:items-center tw:overflow-y-auto tw:p-4">
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-tailwind-migrated="true"
          data-size={size}
          className={cn(
            "tw:relative tw:z-dialog tw:my-auto tw:w-full tw:max-w-lg tw:rounded-xl tw:border tw:border-border tw:bg-popover tw:text-popover-foreground tw:shadow-lg tw:outline-none tw:data-[size=sm]:max-w-sm tw:data-[size=lg]:max-w-4xl tw:data-[size=xl]:max-w-6xl",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="tw:absolute tw:top-4 tw:right-4"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="tw:sr-only">{m.close()}</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </>
  );
  return (
    <DialogPortal>{admin ? <AdminThemeScope>{content}</AdminThemeScope> : content}</DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "tw:flex tw:flex-col tw:gap-2 tw:border-b tw:border-border tw:p-4 tw:pr-14",
        className,
      )}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("tw:p-4", className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "tw:flex tw:flex-wrap tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:p-4",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {m.close()}
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("tw:m-0 tw:text-lg tw:leading-normal tw:font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "tw:text-sm tw:text-muted-foreground tw:*:[a]:underline tw:*:[a]:underline-offset-3 tw:*:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
