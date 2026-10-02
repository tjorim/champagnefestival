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
import { SaveIcon, UserPlusIcon } from "lucide-react";
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
import type { Person } from "@/types/person";
import { EMAIL_REGEX } from "@/config/constants";

interface PersonFormModalProps {
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
  clubName: string;
  active: boolean;
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

export default function PersonFormModal({ show, person, onSave, onHide }: PersonFormModalProps) {
  const isEdit = person != null;
  const [error, setError] = useState<string | null>(null);

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(
    () =>
      person
        ? {
            name: person.name,
            email: person.email ?? "",
            phone: person.phone ?? "",
            preferredLanguage: person.preferredLanguage ?? null,
            address: person.address ?? "",
            rolesInput: person.roles.join(", "),
            notes: person.notes ?? "",
            clubName: person.clubName ?? "",
            active: person.active,
          }
        : {
            name: "",
            email: "",
            phone: "",
            preferredLanguage: null,
            address: "",
            rolesInput: "",
            notes: "",
            clubName: "",
            active: true,
          },
    [person],
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
          roles: parseRoles(value.rolesInput),
          notes: value.notes.trim(),
          clubName: value.clubName.trim(),
          active: value.active,
        });
        onHide();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isEdit
              ? m.admin_people_error_update()
              : m.admin_people_error_create(),
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
        if (!open) onHide();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>
            <Icon icon={UserPlusIcon} className="tw:me-2" />
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
            {error && (
              <Alert variant="danger" className="tw:py-2 tw:text-sm" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <AdminField className="tw:mb-4" controlId="person-name">
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
                  const showErr = !!field.errors.length && field.meta.isTouched;
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
                <AdminField controlId="person-email">
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
                <AdminField controlId="person-phone">
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

            <AdminField className="tw:mb-4" controlId="person-address">
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

            <form.Field name="preferredLanguage">
              {(field) => (
                <AdminField className="tw:mb-4" controlId="person-preferred-language">
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
            <AdminField className="tw:mb-4" controlId="person-club">
              <AdminLabel className="tw:text-subtle tw:text-sm">
                {m.admin_people_club_name_label()}
              </AdminLabel>
              <form.Field name="clubName">
                {(field) => (
                  <AdminInput
                    type="text"
                    className="tw:bg-muted tw:text-content tw:border-input"
                    maxLength={200}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <AdminField className="tw:mb-4" controlId="person-roles">
              <AdminLabel className="tw:text-subtle tw:text-sm">
                {m.admin_people_roles_label()}
              </AdminLabel>
              <div className="tw:flex tw:flex-wrap tw:gap-2 tw:mb-2">
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
                    className="tw:bg-muted tw:text-content tw:border-input"
                    placeholder={m.admin_people_roles_placeholder()}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <AdminField className="tw:mb-4" controlId="person-notes">
              <AdminLabel className="tw:text-subtle tw:text-sm">{m.admin_notes()}</AdminLabel>
              <form.Field name="notes">
                {(field) => (
                  <AdminTextarea
                    rows={2}
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
                  id="person-active"
                  type="switch"
                  label={m.admin_people_active_label()}
                  checked={field.value}
                  onCheckedChange={(e) => field.handleChange(e)}
                  className="tw:text-subtle tw:text-sm"
                />
              )}
            </form.Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onHide}>
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
    </Dialog>
  );
}
