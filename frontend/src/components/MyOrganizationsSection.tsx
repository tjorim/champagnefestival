import OrganizationTranslationSuggestion from "@/components/OrganizationTranslationSuggestion";
import OrganizationLogoUpload from "@/components/OrganizationLogoUpload";
import OrganizationLogoPreview from "@/components/OrganizationLogoPreview";
import { useId, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  PublicField,
  PublicLabel,
  PublicInput,
  PublicTextarea,
  PublicSelect,
  PublicOption,
} from "@/components/PublicFields";
import {
  organizationChangesRequest,
  OrganizationChangeConflictError,
  organizationFieldLabel,
  organizationStatusLabel,
  organizationTextFields,
  type OrganizationChange,
  type OrganizationTexts,
} from "@/utils/organizationChangesApi";

export interface ManagedOrganization {
  id: number;
  name: string;
  type: string;
  website: string;
  active: boolean;
  description_language?: string | null;
  description_nl?: string | null;
  description_fr?: string | null;
  description_en?: string | null;
}

function ProposalForm({
  row,
  pending,
  headers,
  onSaved,
}: {
  row: ManagedOrganization;
  pending?: OrganizationChange;
  headers: () => Record<string, string>;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<OrganizationTexts>(
    () =>
      Object.fromEntries(
        organizationTextFields.map((field) => [
          field,
          pending?.proposed[field] !== undefined ? pending.proposed[field] : (row[field] ?? null),
        ]),
      ) as OrganizationTexts,
  );
  const [validation, setValidation] = useState("");
  const submission = useRef<{ serialized: string; id: string } | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: (body: unknown) =>
      organizationChangesRequest(
        `/api/me/organizations/${row.id}/changes`,
        headers(),
        undefined,
        body,
      ),
    onSuccess: onSaved,
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const website = (values.website ?? "").trim();
    if (website && !/^https?:\/\/.+/.test(website)) {
      setValidation(m.admin_item_url_invalid());
      return;
    }
    const texts = Object.fromEntries(
      organizationTextFields.map((field) => [
        field,
        field === "website" ? website : values[field]?.trim() || null,
      ]),
    ) as OrganizationTexts;
    if (texts.description_nl || texts.description_fr || texts.description_en) {
      if (
        !texts.description_language ||
        !texts[`description_${texts.description_language}` as keyof OrganizationTexts]
      ) {
        setValidation(m.admin_item_description_original_required());
        return;
      }
    } else texts.description_language = null;
    const proposed = Object.fromEntries(
      organizationTextFields
        .filter((field) => texts[field] !== (row[field] ?? (field === "website" ? "" : null)))
        .map((field) => [field, texts[field]]),
    );
    if (!Object.keys(proposed).length) {
      setValidation(m.manager_change_empty());
      return;
    }
    setValidation("");
    const serialized = JSON.stringify(proposed);
    if (submission.current?.serialized !== serialized)
      submission.current = { serialized, id: crypto.randomUUID() };
    mutation.mutate({ ...proposed, submission_id: submission.current.id });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p>{m.manager_change_help()}</p>
      <PublicField>
        <PublicLabel>{m.admin_item_website_url()}</PublicLabel>
        <PublicInput
          value={values.website ?? ""}
          maxLength={500}
          onChange={(event) => setValues({ ...values, website: event.target.value })}
        />
      </PublicField>
      <PublicField>
        <PublicLabel>{m.admin_item_description_language()}</PublicLabel>
        <PublicSelect
          value={values.description_language ?? "nl"}
          onValueChange={(value) => setValues({ ...values, description_language: value })}
        >
          <PublicOption value="nl">{m.admin_item_description_nl()}</PublicOption>
          <PublicOption value="fr">{m.admin_item_description_fr()}</PublicOption>
          <PublicOption value="en">{m.admin_item_description_en()}</PublicOption>
        </PublicSelect>
      </PublicField>
      <p className="text-sm text-subtle">{m.admin_item_description_help()}</p>
      {(["nl", "fr", "en"] as const).map((language) => {
        const field = `description_${language}` as const;
        return (
          <PublicField key={field}>
            <PublicLabel>{organizationFieldLabel(field)}</PublicLabel>
            <PublicTextarea
              maxLength={600}
              value={values[field] ?? ""}
              onChange={(event) =>
                setValues({
                  ...values,
                  [field]: event.target.value,
                  description_language: values.description_language ?? "nl",
                })
              }
            />
            <OrganizationTranslationSuggestion
              url={`/api/me/organizations/${row.id}/translation`}
              headers={headers}
              source={values.description_language ?? "nl"}
              target={language}
              text={
                values[
                  `description_${values.description_language ?? "nl"}` as keyof OrganizationTexts
                ] ?? ""
              }
              targetText={values[field] ?? ""}
              onDraft={(text) =>
                setValues((current) => ({
                  ...current,
                  [field]: text,
                  description_language: current.description_language ?? "nl",
                }))
              }
            />
          </PublicField>
        );
      })}
      {validation && (
        <Alert variant="danger" role="alert">
          {validation}
        </Alert>
      )}
      {mutation.isError && (
        <Alert variant="danger" role="alert">
          {mutation.error instanceof OrganizationChangeConflictError
            ? mutation.error.message
            : m.manager_error()}
        </Alert>
      )}
      <Button type="submit" disabled={mutation.isPending}>
        {m.manager_change_submit()}
      </Button>
    </form>
  );
}

function ManagedOrganizationEditor({
  row,
  headers,
}: {
  row: ManagedOrganization;
  headers: () => Record<string, string>;
}) {
  const instance = useId();
  const [editing, setEditing] = useState(false);
  const history = useQuery({
    queryKey: ["organization-changes", instance, row.id],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      organizationChangesRequest<OrganizationChange[]>(
        `/api/me/organizations/${row.id}/changes`,
        headers(),
        signal,
      ),
  });
  const pending = history.data?.find((change) => change.status === "pending");
  const currentRow = history.data?.[0]
    ? { ...row, ...history.data[0].current, website: history.data[0].current.website ?? "" }
    : row;
  return (
    <article className="rounded-lg border border-subtle p-4 flex flex-col gap-4">
      <h3 className="text-lg font-medium">{row.name}</h3>
      {history.isError && <Alert variant="danger">{m.manager_error()}</Alert>}
      <OrganizationLogoUpload
        url={`/api/me/organizations/${row.id}/logo`}
        headers={headers}
        onSaved={() => {
          setEditing(false);
          void history.refetch();
        }}
      />
      {pending?.proposed.image && (
        <OrganizationLogoPreview
          key={pending.id}
          url={`/api/me/organizations/${row.id}/changes/${pending.id}/logo`}
          headers={headers}
        />
      )}
      {history.data?.map((change) => (
        <div key={change.id}>
          <p>{organizationStatusLabel(change.status)}</p>
          {change.reason && <p className="whitespace-pre-wrap">{change.reason}</p>}
          {change.superseded_fields.length > 0 && (
            <p>
              {m.manager_change_superseded()}:{" "}
              {change.superseded_fields.map(organizationFieldLabel).join(", ")}
            </p>
          )}
        </div>
      ))}
      {editing ? (
        <ProposalForm
          key={pending?.id ?? "new"}
          row={currentRow}
          pending={pending}
          headers={headers}
          onSaved={() => {
            setEditing(false);
            void history.refetch();
          }}
        />
      ) : (
        <Button
          variant="outline"
          disabled={history.isPending || history.isError}
          onClick={() => setEditing(true)}
        >
          {m.manager_change_edit()}
        </Button>
      )}
      {editing && (
        <Button variant="outline" onClick={() => setEditing(false)}>
          {m.admin_action_cancel()}
        </Button>
      )}
    </article>
  );
}

export default function MyOrganizationsSection({
  organizations,
  headers,
}: {
  organizations: ManagedOrganization[];
  headers: () => Record<string, string>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">{m.manager_title()}</h2>
      {organizations.map((row) => (
        <ManagedOrganizationEditor key={row.id} row={row} headers={headers} />
      ))}
    </section>
  );
}
