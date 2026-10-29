import {
  ADMIN_CONTROL_CLASS,
  ADMIN_LABEL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminError,
  AdminSelect,
  AdminOption,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { PersonDirectoryMatches } from "./PersonDirectoryMatches";
import { SaveIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useLayoutEffect, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { Alert } from "@/components/ui/alert";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { isDraftDirty, useDirtyDismiss, useEditorSession } from "@/hooks/useDirtyDismiss";
import { m } from "@/paraglide/messages";
import { usePersonFieldErrors } from "@/hooks/usePersonFieldErrors";
import { apiErrorMessage } from "@/utils/apiErrors";
import type { Person } from "@/types/person";
import { EMAIL_REGEX } from "@/config/constants";

interface PersonFormModalProps {
  authHeaders?: () => Record<string, string>;
  onReuse?: (person: Person) => void;
  show: boolean;
  person: Person | null;
  onSave: (data: PersonFormData) => Promise<void>;
  onHide: () => void;
}

export interface PersonFormData {
  name: string;
  email: string;
  phone: string;
  preferredLanguage?: "nl" | "fr" | "en" | null;
  address: string;
  roles: string[];
  notes: string;
}

const KNOWN_ROLES = ["member", "volunteer", "visitor", "admin"] as const;
type KnownRole = (typeof KNOWN_ROLES)[number];

/** Maps localized or variant spellings to canonical role keys */
const ROLE_ALIASES: Record<string, KnownRole> = {
  // member
  member: "member",
  lid: "member",
  membre: "member",
  // volunteer
  volunteer: "volunteer",
  vrijwilliger: "volunteer",
  benevole: "volunteer",
  bénévole: "volunteer",
  // visitor
  visitor: "visitor",
  bezoeker: "visitor",
  visiteur: "visitor",
  // admin
  admin: "admin",
  beheerder: "admin",
  administrateur: "admin",
};

function canonicalizeRole(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ROLE_ALIASES[key] ?? key;
}

function roleLabel(role: string): string {
  switch (role) {
    case "member":
      return m.admin_role_member();
    case "volunteer":
      return m.admin_role_volunteer();
    case "visitor":
      return m.admin_role_visitor();
    case "admin":
      return m.admin_role_admin();
    default:
      return role;
  }
}

function parseRoles(raw: string): string[] {
  return raw
    .split(",")
    .map((r) => canonicalizeRole(r))
    .filter(Boolean);
}

export default function PersonFormModal({
  show,
  person,
  onSave,
  onHide,
  authHeaders,
  onReuse,
}: PersonFormModalProps) {
  const fieldErrors = usePersonFieldErrors("person");
  const [error, setError] = useState<string | null>(null);

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  //
  // Seeded from the record as it was when the editor opened (`useEditorSession`),
  // so a background refresh of the people list neither rewrites fields the user
  // has not touched nor moves the baseline used to decide whether to confirm a
  // discard.
  const { record, sessionId } = useEditorSession(show, person?.id ?? "", person);
  const isEdit = record != null;
  const defaultValues = useMemo(
    () =>
      record
        ? {
            name: record.name,
            email: record.email ?? "",
            phone: record.phone ?? "",
            preferredLanguage: record.preferredLanguage ?? null,
            address: record.address ?? "",
            rolesInput: record.roles.join(", "),
            notes: record.notes ?? "",
          }
        : {
            name: "",
            email: "",
            phone: "",
            preferredLanguage: null,
            address: "",
            rolesInput: "",
            notes: "",
          },
    [record],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setError(null);
      fieldErrors.clear();
      try {
        await onSave({
          name: value.name.trim(),
          email: value.email.trim(),
          phone: value.phone.trim(),
          preferredLanguage: value.preferredLanguage,
          address: value.address.trim(),
          roles: parseRoles(value.rolesInput),
          notes: value.notes.trim(),
        });
        onHide();
      } catch (err) {
        fieldErrors.capture(err);
        setError(
          apiErrorMessage(
            err,
            isEdit ? m.admin_people_error_update() : m.admin_people_error_create(),
          ),
        );
      }
    },
  });

  // Every editing session starts from the record again, discarding edits that were
  // abandoned by closing the modal: `defaultValues` alone cannot do that because the
  // library keeps the fields a user has touched.
  useLayoutEffect(() => {
    if (show) form.reset(defaultValues);
    // `sessionId` covers reopening the same record, which leaves `defaultValues` unchanged.
  }, [show, sessionId, form, defaultValues]);
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setError(null);
      fieldErrors.clear();
    }
  }

  const nameValue = useSelector(form.atom, (s) => s.values.name);
  const isSubmitting = useSelector(form.atom, (s) => s.isSubmitting);
  const values = useSelector(form.atom, (s) => s.values);
  const { requestClose, confirmDialog } = useDirtyDismiss({
    dirty: isDraftDirty(values, defaultValues),
    busy: isSubmitting,
    onDismiss: onHide,
  });
  const rolesInput = useSelector(form.atom, (s) => s.values.rolesInput) ?? "";
  const currentRoles = parseRoles(rolesInput);

  function toggleRole(role: string) {
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    form.setFieldValue("rolesInput", next.join(", "));
  }

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>
            <Icon icon={UserPlusIcon} className="me-2" />
            {isEdit ? m.admin_people_edit_title() : m.admin_people_create_title()}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          noValidate
        >
          <DialogBody>
            {!isEdit && show && authHeaders && onReuse && (
              <PersonDirectoryMatches
                name={values.name}
                email={values.email}
                authHeaders={authHeaders}
                onReuse={(existing) => {
                  setError(null);
                  fieldErrors.clear();
                  onReuse(existing);
                }}
              />
            )}
            {error && (
              <Alert variant="danger" className="py-2 text-sm" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <AdminField
              className="mb-4"
              controlId="person-name"
              serverError={fieldErrors.field("name")}
            >
              <AdminLabel className={ADMIN_LABEL_CLASS}>{m.registration_name()} *</AdminLabel>
              <form.Field
                name="name"
                validators={[
                  {
                    run: ({ value }) =>
                      !value?.trim() ? m.registration_errors_name_required() : undefined,
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const showErr = !!field.errors.length && field.meta.isTouched;
                  return (
                    <>
                      <AdminInput
                        type="text"
                        className={ADMIN_CONTROL_CLASS}
                        maxLength={200}
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={showErr}
                      />
                      {showErr && <AdminError>{field.errors[0]?.message}</AdminError>}
                    </>
                  );
                }}
              </form.Field>
            </AdminField>

            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter mb-4">
              <div className="w-full site-md:w-6/12">
                <AdminField controlId="person-email" serverError={fieldErrors.field("email")}>
                  <AdminLabel className={ADMIN_LABEL_CLASS}>{m.registration_email()}</AdminLabel>
                  <form.Field
                    name="email"
                    validators={[
                      {
                        run: ({ value }) =>
                          value && !EMAIL_REGEX.test(value)
                            ? m.registration_errors_email_invalid()
                            : undefined,
                        triggers: ["change"],
                      },
                    ]}
                  >
                    {(field) => {
                      const showErr = field.meta.isTouched && field.errors.length > 0;
                      return (
                        <>
                          <AdminInput
                            type="email"
                            className={ADMIN_CONTROL_CLASS}
                            maxLength={200}
                            value={field.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            aria-invalid={showErr}
                          />
                          {showErr && <AdminError>{field.errors[0]?.message}</AdminError>}
                        </>
                      );
                    }}
                  </form.Field>
                </AdminField>
              </div>
              <div className="w-full site-md:w-6/12">
                <AdminField controlId="person-phone" serverError={fieldErrors.field("phone")}>
                  <AdminLabel className={ADMIN_LABEL_CLASS}>{m.registration_phone()}</AdminLabel>
                  <form.Field name="phone">
                    {(field) => (
                      <AdminInput
                        type="tel"
                        className={ADMIN_CONTROL_CLASS}
                        maxLength={50}
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                </AdminField>
              </div>
            </div>

            <AdminField
              className="mb-4"
              controlId="person-address"
              serverError={fieldErrors.field("address")}
            >
              <AdminLabel className={ADMIN_LABEL_CLASS}>
                {m.admin_people_address_label()}
              </AdminLabel>
              <form.Field name="address">
                {(field) => (
                  <AdminInput
                    type="text"
                    className={ADMIN_CONTROL_CLASS}
                    maxLength={300}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <form.Field name="preferredLanguage">
              {(field) => (
                <AdminField className="mb-4" controlId="person-preferred-language">
                  <AdminLabel>{m.registration_preferred_language()}</AdminLabel>
                  <AdminSelect
                    value={field.value ?? ""}
                    onValueChange={(event) =>
                      field.handleChange((event || null) as "nl" | "fr" | "en" | null)
                    }
                  >
                    <AdminOption value="">{m.admin_email_language_unknown()}</AdminOption>
                    <AdminOption value="nl">Nederlands</AdminOption>
                    <AdminOption value="fr">Français</AdminOption>
                    <AdminOption value="en">English</AdminOption>
                  </AdminSelect>
                </AdminField>
              )}
            </form.Field>
            <p className="text-sm text-subtle mb-4">{m.workspace_role_help()}</p>
            <AdminField className="mb-4" controlId="person-roles">
              <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_people_roles_label()}</AdminLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {KNOWN_ROLES.map((role) => (
                  <Button
                    key={role}
                    size="sm"
                    variant={currentRoles.includes(role) ? "warning" : "outline"}
                    onClick={() => toggleRole(role)}
                    type="button"
                  >
                    {roleLabel(role)}
                  </Button>
                ))}
              </div>
              <form.Field name="rolesInput">
                {(field) => (
                  <AdminInput
                    type="text"
                    className={ADMIN_CONTROL_CLASS}
                    placeholder={m.admin_people_roles_placeholder()}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <AdminField
              className="mb-4"
              controlId="person-notes"
              serverError={fieldErrors.field("notes")}
            >
              <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_notes()}</AdminLabel>
              <form.Field name="notes">
                {(field) => (
                  <AdminTextarea
                    rows={2}
                    className={ADMIN_CONTROL_CLASS}
                    maxLength={2000}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => void requestClose()}>
              {m.admin_action_cancel()}
            </Button>
            <Button
              type="submit"
              variant="warning"
              size="sm"
              disabled={isSubmitting || !nameValue?.trim()}
            >
              {isSubmitting ? <Spinner size="sm" /> : <Icon icon={SaveIcon} />}
              {m.admin_people_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
