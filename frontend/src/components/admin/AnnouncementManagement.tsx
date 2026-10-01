import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    queryFn: async () => {
      const response = await fetch("/api/announcements", { headers: authHeaders() });
      if (!response.ok) throw new Error(m.admin_error_load_announcements());
      return response.json() as Promise<Announcement[]>;
    },
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  const [editing, setEditing] = useState<string | null>(null);
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
          headers: authHeaders(),
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
      form.reset(empty);
      setEditing(null);
      void refresh();
    },
    retry: false,
  });

  const editingItem = editing ? (items.find((i) => i.id === editing) ?? null) : null;

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EditionModal for the details.
  const formDefaultValues = useMemo(
    (): Draft =>
      editingItem
        ? {
            text_nl: editingItem.text_nl,
            text_en: editingItem.text_en,
            text_fr: editingItem.text_fr,
            level: editingItem.level,
            active: editingItem.active,
            starts_at: localDate(editingItem.starts_at),
            ends_at: localDate(editingItem.ends_at),
            link_url: editingItem.link_url,
            link_label_nl: editingItem.link_label_nl,
            link_label_en: editingItem.link_label_en,
            link_label_fr: editingItem.link_label_fr,
          }
        : empty,
    [editingItem],
  );

  const form = useForm({
    defaultValues: formDefaultValues,
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await save.mutateAsync(value);
      } catch (reason) {
        setError(String(reason));
      }
    },
  });

  // Seed the form when entering edit mode. Reset during render (the
  // "adjusting state when a prop changes" pattern) since this only needs to
  // react to `editing` changing to a specific item, not to every render.
  const [lastEditing, setLastEditing] = useState(editing);
  if (editing !== lastEditing) {
    setLastEditing(editing);
    if (editing) form.reset(formDefaultValues);
  }
  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/announcements/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_announcement_request(),
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });
  const handleDelete = useCallback(
    async (id: string) => {
      const confirmed = await confirm({
        title: m.admin_announcement_delete_title(),
        body: m.admin_announcement_delete_confirm(),
        errorFallback: m.admin_error_delete_announcement(),
      });
      if (confirmed) remove.mutate(id);
    },
    [confirm, remove],
  );
  const update = useCallback(
    async (item: Announcement, values: Partial<Announcement>) =>
      fetchJsonOrThrowWithUnauthorized(
        `/api/announcements/${item.id}`,
        {
          method: "PUT",
          headers: authHeaders(),
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
          headers: authHeaders(),
          body: JSON.stringify({ ordered_ids: ordered.map((item) => item.id) }),
        },
        m.admin_error_reorder_announcements(),
      );
      await refresh();
    },
    [items, authHeaders, refresh],
  );
  type AnnouncementStatus = "disabled" | "scheduled" | "expired" | "active";
  const status = (item: Announcement): AnnouncementStatus =>
    !item.active
      ? "disabled"
      : item.starts_at && new Date(item.starts_at) > new Date()
        ? "scheduled"
        : item.ends_at && new Date(item.ends_at) <= new Date()
          ? "expired"
          : "active";
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
                onClick={() => void move(row.index, -1)}
              >
                ↑
              </Button>{" "}
              <Button
                size="sm"
                variant="outline"
                disabled={row.index === items.length - 1}
                onClick={() => void move(row.index, 1)}
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
          cell: ({ row }) =>
            row.original[`text_${preview}`] || (
              <em>{m.admin_announcement_missing_translation()}</em>
            ),
        }),
        columnHelper.display({
          id: "locales",
          header: m.admin_announcement_locales_column(),
          enableSorting: false,
          cell: ({ row }) =>
            (["nl", "en", "fr"] as const).map((locale) => (
              <Badge
                className="tw:me-1"
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
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          meta: { tdClassName: "tw:whitespace-nowrap" },
          cell: ({ row }) => {
            const item = row.original;
            return (
              <>
                <Button size="sm" onClick={() => setEditing(item.id)}>
                  {m.admin_edit()}
                </Button>{" "}
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() =>
                    void update(item, { active: !item.active })
                      .then(refresh)
                      .catch((reason) => setError(String(reason)))
                  }
                >
                  {item.active
                    ? m.admin_announcement_disable_action()
                    : m.admin_announcement_publish_action()}
                </Button>{" "}
                <Button size="sm" variant="danger" onClick={() => void handleDelete(item.id)}>
                  {m.admin_delete()}
                </Button>
              </>
            );
          },
        }),
      ]),
    [items, preview, move, update, refresh, handleDelete],
  );

  const table = useAppTable({ data: items, columns, getRowId: (row) => row.id }, () => ({}));

  return (
    <Card>
      <CardHeader>
        <h2 className="tw:text-xl tw:font-medium tw:leading-tight tw:mb-0">
          {m.admin_announcements_section()}
        </h2>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="danger">{error}</Alert>}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="tw:flex tw:flex-wrap tw:-mx-1 tw:*:w-full tw:*:px-1 tw:gap-y-2">
            {(["nl", "en", "fr"] as const).map((locale) => (
              <AdminField className="tw:site-md:w-4/12" key={locale}>
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
          <div className="tw:flex tw:flex-wrap tw:-mx-1 tw:*:w-full tw:*:px-1 tw:gap-y-2 tw:mt-1">
            <AdminField className="tw:site-md:w-3/12">
              <AdminLabel>{m.admin_announcement_level_label()}</AdminLabel>
              <form.Field name="level">
                {(field) => (
                  <AdminSelect
                    value={field.value}
                    onValueChange={(event) => field.handleChange(event as Draft["level"])}
                    onBlur={field.handleBlur}
                  >
                    <AdminOption value="info">{m.admin_announcement_level_info()}</AdminOption>
                    <AdminOption value="warning">
                      {m.admin_announcement_level_warning()}
                    </AdminOption>
                    <AdminOption value="urgent">{m.admin_announcement_level_urgent()}</AdminOption>
                  </AdminSelect>
                )}
              </form.Field>
            </AdminField>
            <AdminField className="tw:site-md:w-3/12">
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
            <AdminField className="tw:site-md:w-3/12">
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
            <AdminField className="tw:site-md:w-3/12">
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
          <div className="tw:flex tw:flex-wrap tw:-mx-1 tw:*:w-full tw:*:px-1 tw:gap-y-2 tw:mt-1">
            {(["nl", "en", "fr"] as const).map((locale) => (
              <AdminField className="tw:site-md:w-4/12" key={locale}>
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
                className="tw:mt-4"
                label={m.admin_announcement_publish_immediately()}
                checked={field.value}
                onCheckedChange={(event) => field.handleChange(event)}
              />
            )}
          </form.Field>
          <div className="tw:flex tw:gap-2 tw:mt-4">
            <Button type="submit" disabled={save.isPending}>
              {editing ? m.admin_save() : m.admin_create_action()}
            </Button>
            {editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  form.reset(empty);
                }}
              >
                {m.admin_action_cancel()}
              </Button>
            )}
          </div>
        </form>
        <hr />
        <AdminSelect
          className="tw:mb-4 tw:w-auto"
          aria-label={m.admin_announcement_preview_language_label()}
          value={preview}
          onValueChange={(event) => setPreview(event as typeof preview)}
        >
          <AdminOption value="nl">{m.admin_announcement_preview_nl()}</AdminOption>
          <AdminOption value="en">{m.admin_announcement_preview_en()}</AdminOption>
          <AdminOption value="fr">{m.admin_announcement_preview_fr()}</AdminOption>
        </AdminSelect>
        <div data-tailwind-migrated="true" className="tw:w-full">
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
