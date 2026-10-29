import { useNow } from "@/hooks/useNow";
import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { useCallback, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "lucide-react";
import { AdminAddButton, RowActionButton, RowActions } from "./RowActions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import AdminEditorDialog from "./AdminEditorDialog";
import { apiErrorMessage } from "@/utils/apiErrors";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";

interface Announcement {
  id: string;
  text_nl: string | null;
  text_en: string | null;
  text_fr: string | null;
  level: "info" | "warning" | "urgent";
  active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  link_url: string | null;
  link_label_nl: string | null;
  link_label_en: string | null;
  link_label_fr: string | null;
}
type Draft = Omit<Announcement, "id" | "sort_order">;
const empty: Draft = {
  text_nl: "",
  text_en: "",
  text_fr: "",
  level: "info",
  active: false,
  starts_at: null,
  ends_at: null,
  link_url: "",
  link_label_nl: "",
  link_label_en: "",
  link_label_fr: "",
};

/** What an announcement is called in row actions and confirmations: its Dutch text, shortened. */
export function announcementName(item: { text_nl: string | null }): string {
  const text = (item.text_nl ?? "").trim().replace(/\s+/g, " ");
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function localDate(value: string | null, timezoneOffsetMinutes?: number) {
  if (!value) return "";
  const date = new Date(value);
  const offset = timezoneOffsetMinutes ?? date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
export function iso(value: string | null, timezoneOffsetMinutes?: number) {
  if (!value) return null;
  if (timezoneOffsetMinutes === undefined) return new Date(value).toISOString();
  const localAsUtc = new Date(`${value}:00.000Z`);
  return new Date(localAsUtc.getTime() + timezoneOffsetMinutes * 60_000).toISOString();
}

const columnHelper = createAppColumnHelper<Announcement>();

function writePayload(item: Draft) {
  return {
    text_nl: item.text_nl,
    text_en: item.text_en,
    text_fr: item.text_fr,
    level: item.level,
    active: item.active,
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    link_url: item.link_url || null,
    link_label_nl: item.link_label_nl,
    link_label_en: item.link_label_en,
    link_label_fr: item.link_label_fr,
  };
}

export default function AnnouncementManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const client = useQueryClient();
  const key = queryKeys.admin.announcements;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      fetchJsonOrThrowWithUnauthorized<Announcement[]>(
        "/api/announcements",
        { headers: authHeaders(), signal },
        m.admin_error_load_announcements(),
      ),
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  // Keep the editor baseline independent of list refetches while it is open.
  const [editor, setEditor] = useState<{ id: string | null; initial: Draft } | null>(null);
  const editing = editor?.id ?? null;
  const [editorError, setEditorError] = useState("");
  const [preview, setPreview] = useState<"nl" | "en" | "fr">("nl");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: key }), [client, key]);
  const save = useMutation({
    mutationFn: (payload: Draft) =>
      fetchJsonOrThrowWithUnauthorized(
        `/api/announcements${editing ? `/${editing}` : ""}`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            ...writePayload(payload),
            starts_at: iso(payload.starts_at),
            ends_at: iso(payload.ends_at),
            link_url: payload.link_url || null,
          }),
        },
        m.admin_error_save_announcement(),
      ),
    onSuccess: () => {
      closeEditor();
      void refresh();
    },
    retry: false,
  });

  const form = useForm({
    defaultValues: editor?.initial ?? empty,
    onSubmit: async ({ value }) => {
      if (save.isPending) return;
      setEditorError("");
      try {
        await save.mutateAsync(value);
      } catch (reason) {
        setEditorError(apiErrorMessage(reason, m.admin_error_save_announcement()));
      }
    },
  });

  const dirty = useSelector(form.atom, (state) => !state.isDefaultValue);
  const openEditor = useCallback(
    (item?: Announcement) => {
      const initial: Draft = item
        ? {
            text_nl: item.text_nl,
            text_en: item.text_en,
            text_fr: item.text_fr,
            level: item.level,
            active: item.active,
            starts_at: localDate(item.starts_at),
            ends_at: localDate(item.ends_at),
            link_url: item.link_url,
            link_label_nl: item.link_label_nl,
            link_label_en: item.link_label_en,
            link_label_fr: item.link_label_fr,
          }
        : empty;
      setEditor({ id: item?.id ?? null, initial });
      setEditorError("");
      form.reset(initial);
    },
    [form],
  );
  function closeEditor() {
    setEditor(null);
    setEditorError("");
    form.reset(empty);
  }

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/announcements/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_announcement_request(),
      ),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(apiErrorMessage(reason, m.admin_error_delete_announcement())),
    retry: false,
  });
  // Stable mutation callbacks keep table action buttons mounted for focus return.
  const deleteAnnouncement = remove.mutate;
  const handleDelete = useCallback(
    async (item: Announcement) => {
      const confirmed = await confirm({
        title: m.admin_announcement_delete_title(),
        body: m.admin_announcement_delete_confirm({ text: (item.text_nl ?? "").trim() }),
        confirmLabel: m.admin_delete(),
        errorFallback: m.admin_error_delete_announcement(),
      });
      if (confirmed) deleteAnnouncement(item.id);
    },
    [confirm, deleteAnnouncement],
  );
  const update = useCallback(
    async (item: Announcement, values: Partial<Announcement>) =>
      fetchJsonOrThrowWithUnauthorized(
        `/api/announcements/${item.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(writePayload({ ...item, ...values })),
        },
        m.admin_error_update_announcement(),
      ),
    [authHeaders],
  );
  const move = useCallback(
    async (index: number, direction: number) => {
      const ordered = [...items];
      const target = index + direction;
      if (target < 0 || target >= ordered.length) return;
      const current = ordered[index];
      const replacement = ordered[target];
      if (!current || !replacement) return;
      ordered[index] = replacement;
      ordered[target] = current;
      await fetchJsonOrThrowWithUnauthorized(
        "/api/announcements/reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ ordered_ids: ordered.map((item) => item.id) }),
        },
        m.admin_error_reorder_announcements(),
      );
      await refresh();
    },
    [items, authHeaders, refresh],
  );
  const now = useNow();
  type AnnouncementStatus = "disabled" | "scheduled" | "expired" | "active";
  const status = useCallback(
    (item: Announcement): AnnouncementStatus =>
      !item.active
        ? "disabled"
        : item.starts_at && new Date(item.starts_at).getTime() > now
          ? "scheduled"
          : item.ends_at && new Date(item.ends_at).getTime() <= now
            ? "expired"
            : "active",
    [now],
  );
  const statusLabel = (value: AnnouncementStatus) => {
    switch (value) {
      case "disabled":
        return m.admin_announcement_status_disabled();
      case "scheduled":
        return m.admin_announcement_status_scheduled();
      case "expired":
        return m.admin_announcement_status_expired();
      case "active":
        return m.admin_announcement_status_active();
    }
  };

  const actionsColumn = useMemo(
    () =>
      columnHelper.display({
        id: "actions",
        header: m.admin_actions_label(),
        enableSorting: false,
        meta: { tdClassName: "whitespace-nowrap" },
        cell: ({ row }) => {
          const item = row.original;
          const name = announcementName(item);
          return (
            <RowActions
              destructive={
                <RowActionButton
                  destructive
                  icon={TrashIcon}
                  label={m.admin_delete_item({ name })}
                  onClick={() => void handleDelete(item)}
                />
              }
            >
              <RowActionButton
                icon={PencilIcon}
                label={m.admin_edit_item({ name })}
                onClick={() => openEditor(item)}
              />
              <RowActionButton
                icon={item.active ? EyeOffIcon : EyeIcon}
                label={
                  item.active
                    ? m.admin_announcement_disable_named({ name })
                    : m.admin_announcement_publish_named({ name })
                }
                onClick={() =>
                  void update(item, { active: !item.active })
                    .then(refresh)
                    .catch((reason) =>
                      setError(apiErrorMessage(reason, m.admin_error_update_announcement())),
                    )
                }
              />
            </RowActions>
          );
        },
      }),
    [update, refresh, handleDelete, openEditor],
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "order",
          header: m.admin_announcement_order_column(),
          enableSorting: false,
          cell: ({ row }) => (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!row.index}
                onClick={() =>
                  void move(row.index, -1).catch((reason) =>
                    setError(apiErrorMessage(reason, m.admin_error_reorder_announcements())),
                  )
                }
              >
                ↑
              </Button>{" "}
              <Button
                size="sm"
                variant="outline"
                disabled={row.index === items.length - 1}
                onClick={() =>
                  void move(row.index, 1).catch((reason) =>
                    setError(apiErrorMessage(reason, m.admin_error_reorder_announcements())),
                  )
                }
              >
                ↓
              </Button>
            </>
          ),
        }),
        columnHelper.display({
          id: "preview",
          header: m.admin_announcement_preview_column(),
          enableSorting: false,
          cell: ({ row }) => row.original[`text_${preview}`] || <em>{row.original.text_nl}</em>,
        }),
        columnHelper.display({
          id: "locales",
          header: m.admin_announcement_locales_column(),
          enableSorting: false,
          cell: ({ row }) =>
            (["nl", "en", "fr"] as const).map((locale) => (
              <Badge
                className="me-1"
                variant={row.original[`text_${locale}`] ? "success" : "secondary"}
                key={locale}
              >
                {locale}
              </Badge>
            )),
        }),
        columnHelper.display({
          id: "status",
          header: m.admin_status_label(),
          enableSorting: false,
          cell: ({ row }) => (
            <Badge variant={status(row.original) === "active" ? "success" : "secondary"}>
              {statusLabel(status(row.original))}
            </Badge>
          ),
        }),
        actionsColumn,
      ]),
    [items, preview, move, actionsColumn, status],
  );

  const table = useAppTable({ data: items, columns, getRowId: (row) => row.id }, () => ({}));

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-medium leading-tight mb-0">
          {m.admin_announcements_section()}
        </h2>
        <AdminAddButton onClick={() => openEditor()}>{m.admin_announcement_new()}</AdminAddButton>
      </CardHeader>
      <CardContent>
        {(error || query.error) && (
          <Alert variant="danger" role="alert">
            {error || apiErrorMessage(query.error, m.admin_error_load_announcements())}
          </Alert>
        )}
        {editor && (
          <AdminEditorDialog
            title={editing ? m.admin_announcement_edit() : m.admin_announcement_new()}
            busy={save.isPending}
            dirty={dirty}
            onClose={closeEditor}
            footer={
              <Button type="submit" form="announcement-form" disabled={save.isPending}>
                {editing ? m.admin_save() : m.admin_create_action()}
              </Button>
            }
          >
            {editorError && (
              <Alert variant="danger" role="alert">
                {editorError}
              </Alert>
            )}
            <fieldset disabled={save.isPending}>
              <form
                id="announcement-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!save.isPending) void form.handleSubmit();
                }}
              >
                <p className="text-sm text-subtle mb-2">{m.admin_announcement_text_help()}</p>
                <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2">
                  {(["nl", "en", "fr"] as const).map((locale) => (
                    <AdminField className="site-md:w-4/12" key={locale}>
                      <AdminLabel>
                        {m.admin_announcement_text_label({ locale: locale.toUpperCase() })}
                      </AdminLabel>
                      <form.Field name={`text_${locale}`}>
                        {(field) => (
                          <AdminInput
                            maxLength={500}
                            value={field.value ?? ""}
                            onChange={(event) => field.handleChange(event.target.value)}
                            onBlur={field.handleBlur}
                          />
                        )}
                      </form.Field>
                    </AdminField>
                  ))}
                </div>
                <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2 mt-1">
                  <AdminField className="site-md:w-3/12">
                    <AdminLabel>{m.admin_announcement_level_label()}</AdminLabel>
                    <form.Field name="level">
                      {(field) => (
                        <AdminSelect
                          value={field.value}
                          onValueChange={(event) => field.handleChange(event as Draft["level"])}
                          onBlur={field.handleBlur}
                        >
                          <AdminOption value="info">
                            {m.admin_announcement_level_info()}
                          </AdminOption>
                          <AdminOption value="warning">
                            {m.admin_announcement_level_warning()}
                          </AdminOption>
                          <AdminOption value="urgent">
                            {m.admin_announcement_level_urgent()}
                          </AdminOption>
                        </AdminSelect>
                      )}
                    </form.Field>
                  </AdminField>
                  <AdminField className="site-md:w-3/12">
                    <AdminLabel>{m.admin_announcement_starts_label()}</AdminLabel>
                    <form.Field name="starts_at">
                      {(field) => (
                        <AdminInput
                          type="datetime-local"
                          value={localDate(field.value)}
                          onChange={(event) => field.handleChange(event.target.value || null)}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </form.Field>
                  </AdminField>
                  <AdminField className="site-md:w-3/12">
                    <AdminLabel>{m.admin_announcement_ends_label()}</AdminLabel>
                    <form.Field name="ends_at">
                      {(field) => (
                        <AdminInput
                          type="datetime-local"
                          value={localDate(field.value)}
                          onChange={(event) => field.handleChange(event.target.value || null)}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </form.Field>
                  </AdminField>
                  <AdminField className="site-md:w-3/12">
                    <AdminLabel>{m.admin_announcement_link_url_label()}</AdminLabel>
                    <form.Field name="link_url">
                      {(field) => (
                        <AdminInput
                          type="url"
                          value={field.value ?? ""}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </form.Field>
                  </AdminField>
                </div>
                <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2 mt-1">
                  {(["nl", "en", "fr"] as const).map((locale) => (
                    <AdminField className="site-md:w-4/12" key={locale}>
                      <AdminLabel>
                        {m.admin_announcement_link_label_field({ locale: locale.toUpperCase() })}
                      </AdminLabel>
                      <form.Field name={`link_label_${locale}`}>
                        {(field) => (
                          <AdminInput
                            value={field.value ?? ""}
                            onChange={(event) => field.handleChange(event.target.value)}
                            onBlur={field.handleBlur}
                          />
                        )}
                      </form.Field>
                    </AdminField>
                  ))}
                </div>
                <form.Field name="active">
                  {(field) => (
                    <AdminCheck
                      className="mt-4"
                      label={m.admin_announcement_publish_immediately()}
                      checked={field.value}
                      onCheckedChange={(event) => field.handleChange(event)}
                    />
                  )}
                </form.Field>
              </form>
            </fieldset>
          </AdminEditorDialog>
        )}

        <AdminSelect
          className="mb-4 w-auto"
          aria-label={m.admin_announcement_preview_language_label()}
          value={preview}
          onValueChange={(event) => setPreview(event as typeof preview)}
        >
          <AdminOption value="nl">{m.admin_announcement_preview_nl()}</AdminOption>
          <AdminOption value="en">{m.admin_announcement_preview_en()}</AdminOption>
          <AdminOption value="fr">{m.admin_announcement_preview_fr()}</AdminOption>
        </AdminSelect>
        <div className="w-full">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      <table.FlexRender header={header} />
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.tdClassName}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
