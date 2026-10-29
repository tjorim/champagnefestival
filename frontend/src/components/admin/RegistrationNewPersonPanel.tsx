import { useEffect, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import {
  AdminError,
  AdminField,
  AdminInput,
  AdminLabel,
  AdminOption,
  AdminSelect,
} from "@/components/admin/AdminFields";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EMAIL_REGEX } from "@/config/constants";
import { m } from "@/paraglide/messages";
import {
  createAdminPerson,
  fetchAdminPersonOptions,
  type PersonOption,
} from "@/utils/adminRegistrationApi";
import { usePersonFieldErrors } from "@/hooks/usePersonFieldErrors";
import { apiErrorMessage } from "@/utils/apiErrors";
import { queryKeys } from "@/utils/queryKeys";

type Language = "nl" | "fr" | "en" | null;

interface RegistrationNewPersonPanelProps {
  authHeaders: () => Record<string, string>;
  /** Pre-fills the name with what the organiser already typed into the person search. */
  initialName: string;
  onCreated: (person: PersonOption) => void;
  /** An existing person matched the entered email or phone number and was chosen instead. */
  onUseExisting: (person: PersonOption) => void;
  onCancel: () => void;
}

const digits = (value: string) => value.replace(/\D/g, "");

/**
 * Adds a person from inside the booking dialog. The person is saved when the
 * organiser confirms and the caller selects them immediately, so a booking that
 * fails afterwards is retried against this person instead of creating another.
 */
export default function RegistrationNewPersonPanel({
  authHeaders,
  initialName,
  onCreated,
  onUseExisting,
  onCancel,
}: RegistrationNewPersonPanelProps) {
  const fieldErrors = usePersonFieldErrors("registration-new-person");
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<Language>(null);
  const [attempted, setAttempted] = useState(false);
  const [lookup, setLookup] = useState("");

  const trimmedEmail = email.trim();
  const emailInvalid = trimmedEmail !== "" && !EMAIL_REGEX.test(trimmedEmail);
  const nameMissing = name.trim() === "";

  // One lookup for whichever contact detail is entered; an email wins because it is the stronger match.
  useEffect(() => {
    const candidate =
      trimmedEmail && !emailInvalid ? trimmedEmail : digits(phone).length >= 6 ? phone.trim() : "";
    const timer = setTimeout(() => setLookup(candidate), 300);
    return () => clearTimeout(timer);
  }, [trimmedEmail, emailInvalid, phone]);

  const duplicatesQuery = useQuery({
    queryKey: queryKeys.admin.personOptions(lookup),
    queryFn: ({ signal }) => fetchAdminPersonOptions(lookup, authHeaders, signal),
    enabled: lookup !== "",
    staleTime: 30 * 1000,
    retry: false,
  });
  const duplicates = (duplicatesQuery.data ?? []).filter(
    (person) =>
      (trimmedEmail !== "" && person.email.toLowerCase() === trimmedEmail.toLowerCase()) ||
      (digits(phone).length >= 6 && digits(person.phone) === digits(phone)),
  );

  const createPerson = useMutation({
    mutationFn: () =>
      createAdminPerson(
        {
          name: name.trim(),
          email: trimmedEmail,
          phone: phone.trim(),
          preferredLanguage: language,
        },
        authHeaders,
      ),
    retry: false,
    onError: fieldErrors.capture,
    onSuccess: async (person) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.personOptionsRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.people }),
      ]);
      onCreated(person);
    },
  });

  const submit = () => {
    setAttempted(true);
    if (nameMissing || emailInvalid || createPerson.isPending) return;
    fieldErrors.clear();
    createPerson.mutate();
  };

  // This panel sits inside the booking form; Enter must add the person, not submit the booking.
  const submitOnEnter = (event: KeyboardEvent) => {
    // Buttons, selects and the duplicate "Use" actions keep their own Enter behaviour.
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
  };

  return (
    <section
      aria-labelledby="registration-new-person-title"
      className="mb-4 rounded-md border border-input bg-muted p-3"
      onKeyDown={submitOnEnter}
    >
      <h6 id="registration-new-person-title" className="text-highlight">
        {m.admin_registration_new_person_title()}
      </h6>
      <p className="text-subtle text-sm">{m.admin_registration_new_person_help()}</p>

      {createPerson.isError && (
        <Alert variant="danger" className="py-2 text-sm" onClose={() => createPerson.reset()}>
          {apiErrorMessage(createPerson.error, m.admin_people_error_create())}
        </Alert>
      )}

      <AdminField
        className="mb-3"
        controlId="registration-new-person-name"
        serverError={fieldErrors.field("name")}
      >
        <AdminLabel className="text-subtle text-sm">{m.registration_name()} *</AdminLabel>
        <AdminInput
          maxLength={200}
          value={name}
          required
          aria-invalid={attempted && nameMissing}
          onChange={(event) => setName(event.target.value)}
        />
        {attempted && nameMissing && (
          <AdminError>{m.admin_registration_new_person_name_required()}</AdminError>
        )}
      </AdminField>

      <div className="flex flex-wrap gap-3 mb-3">
        <AdminField
          className="flex-1 min-w-48"
          controlId="registration-new-person-email"
          serverError={fieldErrors.field("email")}
        >
          <AdminLabel className="text-subtle text-sm">{m.registration_email()}</AdminLabel>
          <AdminInput
            type="email"
            maxLength={200}
            value={email}
            aria-invalid={emailInvalid}
            onChange={(event) => setEmail(event.target.value)}
          />
          {emailInvalid && <AdminError>{m.registration_errors_email_invalid()}</AdminError>}
        </AdminField>
        <AdminField
          className="flex-1 min-w-48"
          controlId="registration-new-person-phone"
          serverError={fieldErrors.field("phone")}
        >
          <AdminLabel className="text-subtle text-sm">{m.registration_phone()}</AdminLabel>
          <AdminInput
            type="tel"
            maxLength={50}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </AdminField>
        <AdminField className="flex-1 min-w-48" controlId="registration-new-person-language">
          <AdminLabel className="text-subtle text-sm">
            {m.registration_preferred_language()}
          </AdminLabel>
          <AdminSelect
            value={language ?? ""}
            onValueChange={(value) => setLanguage((value || null) as Language)}
          >
            <AdminOption value="">{m.admin_email_language_unknown()}</AdminOption>
            <AdminOption value="nl">Nederlands</AdminOption>
            <AdminOption value="fr">Français</AdminOption>
            <AdminOption value="en">English</AdminOption>
          </AdminSelect>
        </AdminField>
      </div>

      {duplicates.length > 0 && (
        <Alert variant="warning" className="py-2 text-sm">
          <p className="mb-2">{m.admin_registration_duplicates_found()}</p>
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            {duplicates.map((person) => (
              <li key={person.value} className="flex flex-wrap items-center gap-2">
                <span>
                  {person.label}
                  {person.sub ? ` · ${person.sub}` : ""} ·{" "}
                  {m.admin_registration_person_bookings({ count: person.registrationCount })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUseExisting(person)}
                >
                  {m.admin_registration_use_person({ name: person.label })}
                </Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {m.admin_action_cancel()}
        </Button>
        <Button
          type="button"
          variant="warning"
          size="sm"
          disabled={createPerson.isPending}
          onClick={submit}
        >
          {createPerson.isPending ? <Spinner size="sm" /> : <Icon icon={UserPlusIcon} />}
          {m.admin_registration_new_person_save()}
        </Button>
      </div>
    </section>
  );
}
