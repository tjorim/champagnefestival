import { useState } from "react";
import { ApiError, apiErrorMessage } from "@/utils/apiErrors";
import { m } from "@/paraglide/messages";

/** Server validation remains authoritative; never infer fields from English diagnostics. */
export function usePersonFieldErrors(prefix: string) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  return {
    clear: () => setErrors({}),
    /** Editing a field drops only its own server message; other fields keep theirs. */
    clearField: (name: string) =>
      setErrors((current) => {
        if (!(name in current)) return current;
        const { [name]: _removed, ...rest } = current;
        return rest;
      }),
    field: (name: string) => errors[name],
    capture: (error: unknown) => {
      if (!(error instanceof ApiError)) return;
      const fields = [...error.fields];
      if (error.code === "person_invalid_phone") fields.push("phone");
      if (error.code === "member_email_in_use") fields.push("email");
      if (error.code === "person_niss_conflict" || error.code === "person_identity_conflict")
        fields.push("national_register_number");
      if (error.code === "person_eid_conflict" || error.code === "person_identity_conflict")
        fields.push("eid_document_number");
      const next = Object.fromEntries(
        fields.map((field) => [
          field,
          field === "phone"
            ? m.admin_person_invalid_phone()
            : field === "email"
              ? apiErrorMessage(error, m.admin_person_invalid_email())
              : (field === "national_register_number" || field === "eid_document_number") &&
                  error.code?.endsWith("_conflict")
                ? m.admin_person_identity_conflict()
                : m.admin_person_invalid_field(),
        ]),
      );
      setErrors(next);
      const input = fields
        .map((field) => document.getElementById(`${prefix}-${field.replaceAll("_", "-")}`))
        .find((element) => element !== null);
      input?.focus();
    },
  };
}
