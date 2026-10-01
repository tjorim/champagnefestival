import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminError,
  AdminSelect,
  AdminOption,
  AdminTextarea,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { CircleCheckIcon, ContactRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useMemo, useState } from "react";
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
import { m } from "@/paraglide/messages";
import { devError } from "@/utils/devLog";
import { EMAIL_REGEX } from "@/config/constants";
import type { Person } from "@/types/person";

interface MemberFormModalProps {
  show: boolean;
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
  clubName: string;
  notes: string;
  active: boolean;
}

export default function MemberFormModal({ show, member, onSave, onHide }: MemberFormModalProps) {
  const isEdit = member != null;
  const [error, setError] = useState<string | null>(null);

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(
    (): MemberFormData =>
      member
        ? {
            name: member.name,
            email: member.email ?? "",
            phone: member.phone ?? "",
            preferredLanguage: member.preferredLanguage ?? null,
            address: member.address ?? "",
            clubName: member.clubName ?? "",
            notes: member.notes ?? "",
            active: member.active,
          }
        : {
            name: "",
            email: "",
            phone: "",
            preferredLanguage: null,
            address: "",
            clubName: "",
            notes: "",
            active: true,
          },
    [member],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await onSave({
          name: value.name.trim(),
          email: value.email.trim(),
          phone: value.phone.trim(),
          preferredLanguage: value.preferredLanguage,
          address: value.address.trim(),
          clubName: value.clubName.trim(),
          notes: value.notes.trim(),
          active: value.active,
        });
        onHide();
      } catch (err) {
        devError("Member save error:", err);
        const backendMessage =
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message.trim()
            : "";
        setError(
          backendMessage ||
            (isEdit ? m.admin_members_error_update() : m.admin_members_error_create()),
        );
      }
    },
  });

  // Re-open should always start from the record again, discarding edits that were
  // abandoned by closing the modal. Reset during render rather than in an effect
  // (the "adjusting state when a prop changes" pattern) since this only needs to
  // react to the show=false->true transition, not to every render.
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      form.reset(defaultValues);
      setError(null);
    }
  }

  const nameValue = useSelector(form.atom, (s) => s.values.name);
  const isSubmitting = useSelector(form.atom, (s) => s.isSubmitting);

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>
            <Icon icon={ContactRoundIcon} className="tw:me-2" />
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
            {error && (
              <Alert variant="danger" className="tw:py-2 tw:text-sm" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <AdminField className="tw:mb-4" controlId="member-name">
              <AdminLabel className="tw:text-subtle tw:text-sm">
                {m.registration_name()} *
              </AdminLabel>
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
                        className="tw:bg-muted tw:text-content tw:border-input"
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

            <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter tw:mb-4">
              <div className="tw:w-full tw:site-md:w-6/12">
                <AdminField controlId="member-email">
                  <AdminLabel className="tw:text-subtle tw:text-sm">
                    {m.registration_email()}
                  </AdminLabel>
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
                            className="tw:bg-muted tw:text-content tw:border-input"
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
              <div className="tw:w-full tw:site-md:w-6/12">
                <AdminField controlId="member-phone">
                  <AdminLabel className="tw:text-subtle tw:text-sm">
                    {m.registration_phone()}
                  </AdminLabel>
                  <form.Field name="phone">
                    {(field) => (
                      <AdminInput
                        type="tel"
                        className="tw:bg-muted tw:text-content tw:border-input"
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
                <AdminField className="tw:mb-4" controlId="member-preferred-language">
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
            <AdminField className="tw:mb-4" controlId="member-club">
              <AdminLabel className="tw:text-sm tw:font-semibold tw:text-highlight">
                {m.admin_people_club_name_label()}
              </AdminLabel>
              <form.Field name="clubName">
                {(field) => (
                  <AdminInput
                    type="text"
                    className="tw:bg-muted tw:text-content tw:border-input tw:border-warning"
                    maxLength={200}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <AdminField className="tw:mb-4" controlId="member-address">
              <AdminLabel className="tw:text-subtle tw:text-sm">
                {m.admin_people_address_label()}
              </AdminLabel>
              <form.Field name="address">
                {(field) => (
                  <AdminInput
                    type="text"
                    className="tw:bg-muted tw:text-content tw:border-input"
                    maxLength={300}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <AdminField className="tw:mb-4" controlId="member-notes">
              <AdminLabel className="tw:text-subtle tw:text-sm">
                {m.registration_notes()}
              </AdminLabel>
              <form.Field name="notes">
                {(field) => (
                  <AdminTextarea
                    rows={4}
                    className="tw:bg-muted tw:text-content tw:border-input"
                    maxLength={2000}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <form.Field name="active">
              {(field) => (
                <AdminCheck
                  type="switch"
                  id="member-active"
                  className="tw:text-subtle"
                  label={m.admin_people_active_label()}
                  checked={field.value}
                  onCheckedChange={(e) => field.handleChange(e)}
                />
              )}
            </form.Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={onHide} disabled={isSubmitting}>
              {m.admin_action_cancel()}
            </Button>
            <Button variant="warning" type="submit" disabled={isSubmitting || !nameValue?.trim()}>
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="tw:me-2" />
                  {m.admin_save()}
                </>
              ) : (
                <>
                  <Icon icon={CircleCheckIcon} className="tw:me-1" />
                  {m.admin_people_save()}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
