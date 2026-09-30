import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Associations survive TanStack render props without coupling presentation to
// form state. Unnamed groups receive an ID, just like explicitly named fields.
const FieldId = createContext<string | undefined>(undefined);

export function AdminField({
  controlId,
  className,
  ...props
}: ComponentProps<typeof Field> & { controlId?: string }) {
  const generatedId = useId();
  return (
    <FieldId.Provider value={controlId ?? generatedId}>
      <Field className={cn("tw:gap-2", className)} {...props} />
    </FieldId.Provider>
  );
}

export function AdminLabel(props: ComponentProps<typeof FieldLabel>) {
  const id = useContext(FieldId);
  return <FieldLabel htmlFor={id} {...props} />;
}

export function AdminDescription(props: ComponentProps<typeof FieldDescription>) {
  const id = useContext(FieldId);
  return <FieldDescription id={id ? `${id}-description` : undefined} {...props} />;
}

export function AdminError(props: ComponentProps<typeof FieldError>) {
  const id = useContext(FieldId);
  return <FieldError id={id ? `${id}-error` : undefined} {...props} />;
}

function useAssociation(id: string | undefined, invalid?: boolean) {
  const fieldId = useContext(FieldId);
  const resolvedId = id ?? fieldId;
  return {
    id: resolvedId,
    "aria-invalid": invalid || undefined,
    "aria-describedby": fieldId
      ? `${fieldId}-description${invalid ? ` ${fieldId}-error` : ""}`
      : undefined,
  };
}

type InputProps = Omit<ComponentProps<typeof Input>, "size"> & { size?: "sm" | "lg" };
export function AdminInput({ id, size, className, ...props }: InputProps) {
  const association = useAssociation(id, props["aria-invalid"] === true);
  return (
    <Input
      {...association}
      {...props}
      className={cn("tw:text-foreground", size === "sm" && "tw:h-8 tw:text-sm", className)}
    />
  );
}

export function AdminTextarea({
  id,
  className,
  size,
  ...props
}: ComponentProps<typeof Textarea> & { size?: "sm" | "lg" }) {
  const association = useAssociation(id, props["aria-invalid"] === true);
  return (
    <Textarea
      {...association}
      {...props}
      className={cn("tw:text-foreground", size === "sm" && "tw:text-sm", className)}
    />
  );
}

type OptionProps = { value: string | number; children?: ReactNode; disabled?: boolean };
// Option descriptors keep dynamic domain lists declarative; only owned Select
// items render in the DOM. No browser change events are synthesized.
export function AdminOption(_props: OptionProps) {
  return null;
}
export function AdminOptionGroup(_props: { label: ReactNode; children?: ReactNode }) {
  return null;
}

function optionsFrom(
  children: ReactNode,
): { value: string; label: ReactNode; disabled?: boolean }[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionProps>(child)) return [];
    if (child.type === AdminOption) {
      return [
        {
          value: String(child.props.value),
          label: child.props.children,
          disabled: child.props.disabled,
        },
      ];
    }
    return optionsFrom(child.props.children);
  });
}

function renderOptions(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<OptionProps & { label?: ReactNode }>(child)) return null;
    if (child.type === AdminOption) {
      return (
        <SelectItem
          value={String(child.props.value)}
          data-value={String(child.props.value)}
          disabled={child.props.disabled}
        >
          {child.props.children}
        </SelectItem>
      );
    }
    if (child.type === AdminOptionGroup) {
      return (
        <SelectGroup>
          <SelectLabel>{child.props.label}</SelectLabel>
          {renderOptions(child.props.children)}
        </SelectGroup>
      );
    }
    if (child.type === Fragment) return renderOptions(child.props.children);
    return null;
  });
}

export function AdminSelect({
  value,
  onValueChange,
  children,
  size,
  className,
  disabled,
  name,
  required,
  ...props
}: Omit<ComponentProps<typeof SelectTrigger>, "value" | "onChange" | "children" | "size"> & {
  value?: string | number;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
  size?: "sm" | "lg";
  name?: string;
  required?: boolean;
}) {
  const association = useAssociation(props.id, props["aria-invalid"] === true);
  const items = optionsFrom(children);
  return (
    <Select
      value={value == null ? undefined : String(value)}
      onValueChange={(next) => {
        if (next != null) onValueChange?.(next);
      }}
      items={items}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectTrigger
        {...association}
        {...props}
        size={size === "sm" ? "sm" : "default"}
        className={cn(
          "tw:w-full tw:min-w-0 tw:bg-muted tw:text-foreground",
          size === "sm" && "tw:h-8 tw:text-sm",
          className,
        )}
      >
        <SelectValue className="tw:truncate" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {renderOptions(children)}
      </SelectContent>
    </Select>
  );
}

export function AdminCheck({
  id,
  label,
  type = "checkbox",
  inline,
  className,
  ...props
}: Omit<ComponentProps<typeof Checkbox>, "render" | "className"> & {
  className?: string;
  label?: ReactNode;
  type?: "checkbox" | "switch";
  inline?: boolean;
}) {
  const generatedId = useId();
  const resolvedId = id ?? generatedId;
  const Control = type === "switch" ? Switch : Checkbox;
  return (
    <div
      className={cn(
        "tw:flex tw:items-center tw:gap-2",
        inline && "tw:inline-flex tw:me-4",
        className,
      )}
    >
      <Control id={resolvedId} {...props} />
      {label && (
        <FieldLabel htmlFor={resolvedId} className="tw:mb-0">
          {label}
        </FieldLabel>
      )}
    </div>
  );
}
