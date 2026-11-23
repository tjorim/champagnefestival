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
import { Toggle } from "@/components/ui/toggle";
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
import { usePersonFieldErrors } from "../shared/usePersonFieldErrors";
import { apiErrorMessage } from "@/lib/api/apiErrors";
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
  preferred_language?: "nl" | "fr" | "en" | null;
  address: string;
  roles: string[];
  notes: string;
}

const DIRECTORY_ROLES = ["member", "volunteer"] as const;
type DirectoryRole = (typeof DIRECTORY_ROLES)[number];

function roleLabel(role: DirectoryRole): string {
  return role === "member" ? m.admin_role_member() : m.admin_role_volunteer();
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
            preferred_language: record.preferred_language ?? null,
            address: record.address ?? "",
            roles: DIRECTORY_ROLES.filter((role) => record.roles?.includes(role)),
            notes: record.notes ?? "",
          }
        : {
            name: "",
            email: "",
            phone: "",
            preferred_language: null,
            address: "",
            roles: [] as DirectoryRole[],
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
          preferred_language: value.preferred_language,
          address: value.address.trim(),
          roles: value.roles,
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
  const currentRoles = useSelector(form.atom, (s) => s.values.roles);

  function toggleRole(role: DirectoryRole, pressed: boolean) {
    form.setFieldValue(
      "roles",
      DIRECTORY_ROLES.filter((option) =>
        option === role ? pressed : currentRoles.includes(option),
      ),
    );
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
                        onChange={(e) => {
                          fieldErrors.clearField("name");
                          field.handleChange(e.target.value);
                        }}
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
                            onChange={(e) => {
                              fieldErrors.clearField("email");
                              field.handleChange(e.target.value);
                            }}
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
                        onChange={(e) => {
                          fieldErrors.clearField("phone");
                          field.handleChange(e.target.value);
                        }}
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
                    onChange={(e) => {
                      fieldErrors.clearField("address");
                      field.handleChange(e.target.value);
                    }}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <form.Field name="preferred_language">
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
            <fieldset className="mb-4">
              <legend className={ADMIN_LABEL_CLASS}>{m.admin_people_roles_label()}</legend>
              <div className="flex flex-wrap gap-2">
                {DIRECTORY_ROLES.map((role) => (
                  <Toggle
                    key={role}
                    size="sm"
                    variant="outline"
                    pressed={currentRoles.includes(role)}
                    onPressedChange={(pressed) => toggleRole(role, pressed)}
                    type="button"
                  >
                    {roleLabel(role)}
                  </Toggle>
                ))}
              </div>
            </fieldset>

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
                    onChange={(e) => {
                      fieldErrors.clearField("notes");
                      field.handleChange(e.target.value);
                    }}
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
