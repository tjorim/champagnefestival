import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { m } from "@/paraglide/messages";
import { emailConsentErrorMessage } from "@/utils/emailConsentErrors";
import { fetchVoidOrThrowWithUnauthorized } from "@/utils/adminApi";
import {
  emailConsentKeys,
  emailRequest,
  type EmailCategory,
  type EmailCategoryWrite,
} from "@/utils/emailCategories";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Icon } from "@/components/Icon";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AdminEmptyState } from "./AdminEmptyState";
import { AdminCheck, AdminField, AdminInput, AdminLabel, AdminTextarea } from "./AdminFields";
import AdminEditorDialog from "./AdminEditorDialog";

const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,49}$/;
const LOCALES = ["nl", "fr", "en"] as const;
/** Roles an administrator can pick; a role the category already holds stays listed. */
const KNOWN_ROLES = ["member", "volunteer", "visitor", "admin"] as const;

function roleName(role: string): string {
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

const empty: EmailCategoryWrite = {
  name_nl: "",
  name_fr: null,
  name_en: null,
  description_nl: null,
  description_fr: null,
  description_en: null,
  allowed_roles: [],
  sort_order: 0,
};

function toWrite(category: EmailCategory): EmailCategoryWrite {
  return {
    name_nl: category.name_nl,
    name_fr: category.name_fr,
    name_en: category.name_en,
    description_nl: category.description_nl,
    description_fr: category.description_fr,
    description_en: category.description_en,
    allowed_roles: category.allowed_roles,
    sort_order: category.sort_order,
  };
}

function CategoryEditor({
  value,
  nextSortOrder,
  authHeaders,
  onClose,
}: {
  value: EmailCategory | null;
  nextSortOrder: number;
  authHeaders: () => Record<string, string>;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const baseline = value ? toWrite(value) : { ...empty, sort_order: nextSortOrder };
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState<EmailCategoryWrite>({ ...baseline });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (busy) return;
    if (!value && !KEY_PATTERN.test(key)) {
      setError(m.admin_category_key_invalid());
      return;
    }
    if (!draft.name_nl.trim()) {
      setError(m.email_category_name_required());
      return;
    }
    setBusy(true);
    setError("");
    try {
      await emailRequest(
        value ? `/api/email-categories/${encodeURIComponent(value.key)}` : "/api/email-categories",
        authHeaders,
        m.email_category_save_error(),
        undefined,
        // Blank translations are sent as null, which clears them on update.
        {
          ...(value ? {} : { key }),
          ...draft,
          name_nl: draft.name_nl.trim(),
          name_fr: draft.name_fr?.trim() || null,
          name_en: draft.name_en?.trim() || null,
          description_nl: draft.description_nl?.trim() || null,
          description_fr: draft.description_fr?.trim() || null,
          description_en: draft.description_en?.trim() || null,
        },
        value ? "PUT" : "POST",
      );
      await client.invalidateQueries({ queryKey: emailConsentKeys.categories });
      onClose();
    } catch (failure) {
      setError(emailConsentErrorMessage(failure, m.email_category_save_error()));
    } finally {
      setBusy(false);
    }
  }

  const roles = [...new Set([...KNOWN_ROLES, ...draft.allowed_roles])];
  return (
    <AdminEditorDialog
      title={value ? m.email_category_edit() : m.email_category_add()}
      busy={busy}
      dirty={JSON.stringify(draft) !== JSON.stringify(baseline) || key !== ""}
      onClose={onClose}
      footer={
        <Button type="submit" form="email-category-form" disabled={busy}>
          {m.admin_save()}
        </Button>
      }
    >
      <form
        id="email-category-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        {error && <Alert variant="danger">{error}</Alert>}
        <AdminField controlId="email-category-key">
          <AdminLabel>{m.admin_category_key()}</AdminLabel>
          <AdminInput
            value={value ? value.key : key}
            readOnly={Boolean(value)}
            maxLength={50}
            disabled={busy}
            onChange={(event) => setKey(event.target.value)}
          />
          <p className="text-sm text-subtle mt-1 mb-0">{m.email_category_key_help()}</p>
        </AdminField>
        {LOCALES.map((locale) => (
          <div className="flex flex-col gap-2" key={locale}>
            <AdminField controlId={`email-category-name-${locale}`}>
              <AdminLabel>{m.email_category_name({ locale })}</AdminLabel>
              <AdminInput
                maxLength={100}
                value={draft[`name_${locale}`] ?? ""}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, [`name_${locale}`]: event.target.value })}
              />
            </AdminField>
            <AdminField controlId={`email-category-description-${locale}`}>
              <AdminLabel>{m.email_category_description({ locale })}</AdminLabel>
              <AdminTextarea
                rows={2}
                maxLength={500}
                value={draft[`description_${locale}`] ?? ""}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, [`description_${locale}`]: event.target.value })
                }
              />
            </AdminField>
          </div>
        ))}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-base font-semibold mb-1">{m.email_category_roles()}</legend>
          {roles.map((role) => (
            <AdminCheck
              key={role}
              label={roleName(role)}
              checked={draft.allowed_roles.includes(role)}
              disabled={busy}
              onCheckedChange={(checked) =>
                setDraft({
                  ...draft,
                  allowed_roles: checked
                    ? [...draft.allowed_roles, role]
                    : draft.allowed_roles.filter((current) => current !== role),
                })
              }
            />
          ))}
          <p className="text-sm text-subtle mb-0">{m.email_category_roles_help()}</p>
        </fieldset>
        <AdminField className="max-w-40" controlId="email-category-sort-order">
          <AdminLabel>{m.admin_category_sort_order()}</AdminLabel>
          <AdminInput
            type="number"
            min={0}
            value={draft.sort_order}
            disabled={busy}
            onChange={(event) =>
              setDraft({ ...draft, sort_order: Number(event.target.value) || 0 })
            }
          />
        </AdminField>
        {value?.automatic && (
          <p className="text-sm text-subtle">{m.email_category_automatic_help()}</p>
        )}
      </form>
    </AdminEditorDialog>
  );
}

export default function EmailCategoryManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: emailConsentKeys.categories,
    queryFn: ({ signal }) =>
      emailRequest<EmailCategory[]>(
        "/api/email-categories",
        authHeaders,
        m.email_category_load_error(),
        signal,
      ),
  });
  const [editing, setEditing] = useState<EmailCategory | null | undefined>(undefined);
  const [rowError, setRowError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const list = categories.data ?? [];

  async function remove(category: EmailCategory) {
    const confirmed = await confirm({
      title: m.email_category_delete_title(),
      body: m.email_category_delete_confirm({ name: category.name }),
      errorFallback: m.email_category_delete_error(),
    });
    if (!confirmed) return;
    setRowError("");
    try {
      await fetchVoidOrThrowWithUnauthorized(
        `/api/email-categories/${encodeURIComponent(category.key)}`,
        { method: "DELETE", headers: authHeaders() },
        m.email_category_delete_error(),
      );
      await client.invalidateQueries({ queryKey: emailConsentKeys.categories });
    } catch (failure) {
      setRowError(emailConsentErrorMessage(failure, m.email_category_delete_error()));
    }
  }

  return (
    <>
      <Card tone="secondary">
        <CardHeader className="flex items-center justify-between">
          <span className="font-semibold">{m.admin_email_categories_section()}</span>
          <Button variant="outline-warning" size="sm" onClick={() => setEditing(null)}>
            <Icon icon={PlusIcon} />
            {m.email_category_add()}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <p className="text-sm text-subtle m-4 mb-0">{m.email_categories_intro()}</p>
          {rowError && (
            <Alert variant="danger" className="m-4 py-1 text-sm">
              {rowError}
            </Alert>
          )}
          {categories.isError ? (
            <Alert variant="danger" className="m-4 py-1 text-sm">
              {emailConsentErrorMessage(categories.error, m.email_category_load_error())}
            </Alert>
          ) : categories.isPending ? (
            <div className="text-center py-12">
              <Spinner size="sm" role="status">
                <span className="sr-only">{m.admin_loading()}</span>
              </Spinner>
            </div>
          ) : list.length === 0 ? (
            <AdminEmptyState>{m.email_categories_empty()}</AdminEmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.admin_category_key()}</TableHead>
                  <TableHead>{m.email_category_name({ locale: "nl" })}</TableHead>
                  <TableHead>{m.email_category_roles_column()}</TableHead>
                  <TableHead>{m.admin_category_sort_order()}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((category) => (
                  <TableRow key={category.key}>
                    <TableCell className="font-mono text-sm">{category.key}</TableCell>
                    <TableCell>
                      {category.name_nl}{" "}
                      {category.automatic && (
                        <Badge variant="secondary">{m.email_category_automatic()}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {category.allowed_roles.length === 0
                        ? m.email_category_everyone()
                        : category.allowed_roles.map(roleName).join(", ")}
                    </TableCell>
                    <TableCell>{category.sort_order}</TableCell>
                    <TableCell className="w-px whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(category)}
                          aria-label={`${m.admin_edit()} ${category.key}`}
                          title={m.admin_edit()}
                        >
                          <Icon icon={PencilIcon} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => void remove(category)}
                          aria-label={`${m.admin_delete()} ${category.key}`}
                          title={m.admin_delete()}
                        >
                          <Icon icon={TrashIcon} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editing !== undefined && (
        <CategoryEditor
          value={editing}
          nextSortOrder={(list.at(-1)?.sort_order ?? 0) + 10}
          authHeaders={authHeaders}
          onClose={() => setEditing(undefined)}
        />
      )}
      {confirmDialog}
    </>
  );
}
