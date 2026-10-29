import {
  ADMIN_CONTROL_CLASS,
  ADMIN_LABEL_CLASS,
  AdminCheck,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminError,
  AdminSelect,
  AdminOption,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { CircleCheckIcon, ContactRoundIcon } from "lucide-react";
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
import { devError } from "@/utils/devLog";
import { EMAIL_REGEX } from "@/config/constants";
import { roleSince, type Person } from "@/types/person";

interface MemberFormModalProps {
  show: boolean;
  limitReached?: boolean;
  member: Person | null;
  onSave: (data: MemberFormData) => Promise<void>;
  onHide: () => void;
}

export interface MemberFormData {
  name: string;
  email: string;
  phone: string;
  preferredLanguage?: "nl" | "fr" | "en" | null;
  address: string;
  notes: string;
  /** ISO day membership started; empty when unknown. */
  memberSince: string;
  inactivityExempt?: boolean;
  inactivityExemptNote?: string;
}

export default function MemberFormModal({
  show,
  member,
  onSave,
  onHide,
  limitReached = false,
}: MemberFormModalProps) {
  const fieldErrors = usePersonFieldErrors("member");
  const [error, setError] = useState<string | null>(null);
  // The record as it was when the editor opened, so a background refresh neither
  // rewrites untouched fields nor moves the baseline for the discard prompt.
  const { record, sessionId } = useEditorSession(show, member?.id ?? "", member);
  const isEdit = record != null;

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(
    (): MemberFormData =>
      record
        ? {
            name: record.name,
            email: record.email ?? "",
            phone: record.phone ?? "",
            preferredLanguage: record.preferredLanguage ?? null,
            address: record.address ?? "",
            notes: record.notes ?? "",
            inactivityExempt: record.inactivityExempt ?? false,
            inactivityExemptNote: record.inactivityExemptNote ?? "",
            memberSince: roleSince(record, "member") ?? "",
          }
        : {
            name: "",
            email: "",
            phone: "",
            preferredLanguage: null,
            address: "",
            notes: "",
            memberSince: "",
            inactivityExempt: false,
            inactivityExemptNote: "",
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
          notes: value.notes.trim(),
          memberSince: value.memberSince,
          inactivityExempt: value.inactivityExempt,
          inactivityExemptNote: value.inactivityExemptNote,
        });
        onHide();
      } catch (err) {
        fieldErrors.capture(err);
        devError("Member save error:", err);
        setError(
          apiErrorMessage(
            err,
            isEdit ? m.admin_members_error_update() : m.admin_members_error_create(),
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
            <Icon icon={ContactRoundIcon} className="me-2" />
            {isEdit ? m.admin_members_edit_title() : m.admin_members_create_title()}
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
            {!isEdit && limitReached && (
              <Alert variant="warning">{m.admin_members_limit_warning()}</Alert>
            )}
            {error && (
              <Alert variant="danger" className="py-2 text-sm" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <AdminField
              className="mb-4"
              controlId="member-name"
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
                  const showErr = field.meta.isTouched && field.errors.length > 0;
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
                <AdminField controlId="member-email" serverError={fieldErrors.field("email")}>
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
                <AdminField controlId="member-phone" serverError={fieldErrors.field("phone")}>
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

            <form.Field name="preferredLanguage">
              {(field) => (
                <AdminField className="mb-4" controlId="member-preferred-language">
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
            <AdminField className="mb-4" controlId="member-since">
              <AdminLabel className={ADMIN_LABEL_CLASS}>{m.admin_members_since_label()}</AdminLabel>
              <form.Field name="memberSince">
                {(field) => (
                  <AdminInput
                    type="date"
                    className={ADMIN_CONTROL_CLASS}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <AdminField
              className="mb-4"
              controlId="member-address"
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

            <form.Field name="inactivityExempt">
              {(field) => (
                <AdminCheck
                  id="member-inactivity-exempt"
                  label={m.admin_members_inactivity_exempt()}
                  checked={field.value ?? false}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
              )}
            </form.Field>
            <form.Field name="inactivityExemptNote">
              {(field) => (
                <AdminField className="mb-4" controlId="member-exempt-note">
                  <AdminLabel>{m.admin_members_exempt_note()}</AdminLabel>
                  <AdminTextarea
                    maxLength={2000}
                    value={field.value ?? ""}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </AdminField>
              )}
            </form.Field>
            <AdminField
              className="mb-4"
              controlId="member-notes"
              serverError={fieldErrors.field("notes")}
            >
              <AdminLabel className={ADMIN_LABEL_CLASS}>{m.registration_notes()}</AdminLabel>
              <form.Field name="notes">
                {(field) => (
                  <AdminTextarea
                    rows={4}
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
            <Button variant="outline" onClick={() => void requestClose()} disabled={isSubmitting}>
              {m.admin_action_cancel()}
            </Button>
            <Button variant="warning" type="submit" disabled={isSubmitting || !nameValue?.trim()}>
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  {m.admin_save()}
                </>
              ) : (
                <>
                  <Icon icon={CircleCheckIcon} className="me-1" />
                  {m.admin_people_save()}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
