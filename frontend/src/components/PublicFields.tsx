import type { ComponentProps } from "react";
import {
  AdminCheck,
  AdminDescription,
  AdminError,
  AdminField,
  AdminInput,
  AdminLabel,
  AdminOption,
  AdminOptionGroup,
  AdminSelect,
  AdminTextarea,
} from "@/components/admin/AdminFields";

// Public forms share the label/description/error association helpers and the
// owned Base UI controls with admin. They differ only in theming: controls
// follow the active runtime theme instead of the fixed-dark admin palette, and
// carry `data-public-form` so theme stylesheets can retain their typography and
// geometry without matching admin controls.
const PUBLIC = { "data-public-form": "true" } as const;

export const PublicField = AdminField;
export const PublicDescription = AdminDescription;
export const PublicError = AdminError;
export const PublicOption = AdminOption;
export const PublicOptionGroup = AdminOptionGroup;
export const PublicCheck = AdminCheck;

export function PublicLabel(props: ComponentProps<typeof AdminLabel>) {
  return <AdminLabel {...PUBLIC} {...props} />;
}

export function PublicInput(props: ComponentProps<typeof AdminInput>) {
  return <AdminInput {...PUBLIC} {...props} />;
}

export function PublicTextarea(props: ComponentProps<typeof AdminTextarea>) {
  return <AdminTextarea {...PUBLIC} {...props} />;
}

export function PublicSelect(props: ComponentProps<typeof AdminSelect>) {
  return <AdminSelect admin={false} {...PUBLIC} {...props} />;
}
