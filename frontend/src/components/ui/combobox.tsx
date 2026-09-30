"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { cn } from "@/lib/utils";

import { AdminThemeScope } from "@/components/admin/AdminThemeScope";
import { m } from "@/paraglide/messages";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, XIcon, CheckIcon } from "lucide-react";

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("tw:[&_svg:not([class*=size-])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className="tw:pointer-events-none tw:size-4 tw:text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<Button variant="ghost" size="icon-xs" />}
      aria-label={m.admin_action_clear_selection()}
      className={cn(className)}
      {...props}
    >
      <XIcon className="tw:pointer-events-none" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <div
      data-tailwind-migrated="true"
      className={cn(
        "tw:flex tw:w-full tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-input tw:bg-background tw:px-2 tw:text-foreground tw:focus-within:ring-2 tw:focus-within:ring-ring",
        className,
      )}
    >
      <ComboboxPrimitive.Input
        className="tw:min-w-0 tw:flex-1 tw:border-0 tw:bg-transparent tw:py-2 tw:text-sm tw:outline-none"
        disabled={disabled}
        {...props}
      />
      {showTrigger && (
        <ComboboxTrigger
          disabled={disabled}
          render={<Button variant="ghost" size="icon-xs" />}
          aria-label={m.admin_action_show_options()}
        />
      )}
      {showClear && <ComboboxClear disabled={disabled} />}
      {children}
    </div>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <AdminThemeScope>
        <ComboboxPrimitive.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          anchor={anchor}
          className="tw:isolate tw:z-popup"
        >
          <ComboboxPrimitive.Popup
            data-slot="combobox-content"
            data-chips={!!anchor}
            className={cn(
              "tw:relative tw:w-(--anchor-width) tw:max-w-(--available-width) tw:overflow-hidden tw:rounded-md tw:border tw:border-border tw:bg-popover tw:text-popover-foreground tw:shadow-md",
              className,
            )}
            data-tailwind-migrated="true"
            {...props}
          />
        </ComboboxPrimitive.Positioner>
      </AdminThemeScope>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "tw:max-h-72 tw:max-h-(--available-height) tw:scroll-py-1 tw:overflow-y-auto tw:overscroll-contain tw:p-1 tw:data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-sm tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-sm tw:outline-hidden tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="tw:pointer-events-none tw:absolute tw:right-2 tw:flex tw:size-4 tw:items-center tw:justify-center" />
        }
      >
        <CheckIcon className="tw:pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
  );
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("tw:px-2 tw:py-1.5 tw:text-xs tw:text-muted-foreground", className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "tw:hidden tw:w-full tw:justify-center tw:py-2 tw:text-center tw:text-sm tw:text-muted-foreground tw:group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", className)}
      {...props}
    />
  );
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      data-tailwind-migrated="true"
      className={cn(
        "tw:flex tw:min-h-9 tw:flex-wrap tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-input tw:bg-transparent tw:bg-clip-padding tw:px-2.5 tw:py-1.5 tw:text-sm tw:shadow-xs tw:transition-colors tw:focus-within:border-ring tw:focus-within:ring-3 tw:focus-within:ring-ring/50 tw:has-aria-invalid:border-destructive tw:has-aria-invalid:ring-3 tw:has-aria-invalid:ring-destructive/20 tw:has-data-[slot=combobox-chip]:px-1.5 tw:dark:bg-input/30 tw:dark:has-aria-invalid:border-destructive/50 tw:dark:has-aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "tw:flex tw:h-6 tw:w-fit tw:items-center tw:justify-center tw:gap-1 tw:rounded-sm tw:bg-muted tw:px-1.5 tw:text-xs tw:font-medium tw:whitespace-nowrap tw:text-foreground tw:has-disabled:pointer-events-none tw:has-disabled:cursor-not-allowed tw:has-disabled:opacity-50 tw:has-data-[slot=combobox-chip-remove]:pr-0",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="tw:-ml-1 tw:opacity-50 tw:hover:opacity-100"
          data-slot="combobox-chip-remove"
          aria-label={m.admin_action_remove_selection()}
        >
          <XIcon className="tw:pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn("tw:min-w-16 tw:flex-1 tw:outline-none", className)}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
};
