import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminTextarea,
  AdminSelect,
  AdminOption,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { useCallback, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
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

import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";
import { OriginalLanguageSelect } from "@/components/admin/LocalizedFields";

type ComposedMessageChannel = "announcement" | "push";
type ComposedMessageState = "draft" | "scheduled" | "sent";

interface ComposedMessage {
  id: string;
  /** Original language: the title and body must both have text there. */
  text_language: "nl" | "fr" | "en";
  title_nl: string | null;
  title_en: string | null;
  title_fr: string | null;
  body_nl: string | null;
  body_en: string | null;
  body_fr: string | null;
  level: "info" | "warning" | "urgent";
  channels: ComposedMessageChannel[];
  link_url: string | null;
  state: ComposedMessageState;
  scheduled_at: string | null;
  announcement_id: string | null;
  push_audience_snapshot: string[] | null;
  sent_at: string | null;
  created_at: string;
  estimated_push_audience: number;
  push_delivered_count: number;
  push_failed_count: number;
  push_pending_count: number;
}

type Draft = Pick<
  ComposedMessage,
  | "text_language"
  | "title_nl"
  | "title_en"
  | "title_fr"
  | "body_nl"
  | "body_en"
  | "body_fr"
  | "level"
  | "channels"
  | "link_url"
>;

const emptyDraft: Draft = {
  text_language: "nl",
  title_nl: "",
  title_en: "",
  title_fr: "",
  body_nl: "",
  body_en: "",
  body_fr: "",
  level: "info",
  channels: ["announcement"],
  link_url: "",
};

function writePayload(draft: Draft) {
  return {
    text_language: draft.text_language,
    title_nl: draft.title_nl || null,
    title_en: draft.title_en || null,
    title_fr: draft.title_fr || null,
    body_nl: draft.body_nl || null,
    body_en: draft.body_en || null,
    body_fr: draft.body_fr || null,
    level: draft.level,
    channels: draft.channels,
    link_url: draft.link_url || null,
  };
}

const columnHelper = createAppColumnHelper<ComposedMessage>();

function stateBadgeVariant(state: ComposedMessageState): BadgeVariant {
  switch (state) {
    case "draft":
      return "secondary";
    case "scheduled":
      return "warning";
    case "sent":
      return "success";
  }
}

export default function ComposerManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const client = useQueryClient();
  const key = queryKeys.admin.composerMessages;
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      fetchJsonOrThrowWithUnauthorized<ComposedMessage[]>(
        "/api/composer",
        { headers: authHeaders() },
        m.admin_composer_error_load(),
      ),
    refetchInterval: 10_000,
  });
  const items = query.data ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<"nl" | "en" | "fr">("nl");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: key }), [client, key]);

  const save = useMutation({
    mutationFn: (payload: Draft) =>
      fetchJsonOrThrowWithUnauthorized(
        `/api/composer${editing ? `/${editing}` : ""}`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(writePayload(payload)),
        },
        m.admin_composer_error_save(),
      ),
    onSuccess: () => {
      form.reset(emptyDraft);
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
            text_language: editingItem.text_language,
            title_nl: editingItem.title_nl,
            title_en: editingItem.title_en,
            title_fr: editingItem.title_fr,
            body_nl: editingItem.body_nl,
            body_en: editingItem.body_en,
            body_fr: editingItem.body_fr,
            level: editingItem.level,
            channels: editingItem.channels,
            link_url: editingItem.link_url,
          }
        : emptyDraft,
    [editingItem],
  );

  const form = useForm({
    defaultValues: formDefaultValues,
    onSubmit: async ({ value }) => {
      if (save.isPending) return;
      setError("");
      try {
        await save.mutateAsync(value);
      } catch (reason) {
        setError(String(reason));
      }
    },
  });
  const channels = useSelector(form.atom, (s) => s.values.channels);

  // Seed the form when entering edit mode. Reset during render (the
  // "adjusting state when a prop changes" pattern) since this only needs to
  // react to `editing` changing to a specific item, not to every render.
  const [lastEditing, setLastEditing] = useState(editing);
  if (editing !== lastEditing) {
    setLastEditing(editing);
    if (editing) form.reset(formDefaultValues);
  }

  const scheduleSend = useMutation({
    mutationFn: (id: string) =>
      fetchJsonOrThrowWithUnauthorized(
        `/api/composer/${id}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({}),
        },
        m.admin_composer_error_send(),
      ),
    onMutate: () => setError(""),
    onError: (reason) => setError(String(reason)),
    onSuccess: () => void refresh(),
    retry: false,
  });

  const handleSend = useCallback(
    async (item: ComposedMessage) => {
      const confirmed = await confirm({
        title: m.admin_composer_send_confirm_title(),
        body: m.admin_composer_send_confirm_body({
          audience: item.channels.includes("push") ? item.estimated_push_audience : 0,
          channels: item.channels.join(", "),
        }),
        errorFallback: m.admin_composer_error_send(),
        variant: "primary",
      });
      if (confirmed) scheduleSend.mutate(item.id);
    },
    [confirm, scheduleSend],
  );

  const startEdit = useCallback((item: ComposedMessage) => {
    setEditing(item.id);
  }, []);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "title",
          header: m.admin_composer_column_title(),
          enableSorting: false,
          cell: ({ row }) => row.original[`title_${row.original.text_language}`],
        }),
        columnHelper.display({
          id: "channels",
          header: m.admin_composer_column_channels(),
          enableSorting: false,
          cell: ({ row }) => row.original.channels.join(", "),
        }),
        columnHelper.display({
          id: "state",
          header: m.admin_composer_column_state(),
          enableSorting: false,
          cell: ({ row }) => (
            <Badge variant={stateBadgeVariant(row.original.state)}>{row.original.state}</Badge>
          ),
        }),
        columnHelper.display({
          id: "results",
          header: m.admin_composer_column_results(),
          enableSorting: false,
          cell: ({ row }) => {
            const item = row.original;
            if (item.state === "sent") {
              return (
                <span className="text-sm">
                  {item.channels.includes("push") &&
                    m.admin_composer_push_results({
                      delivered: item.push_delivered_count,
                      failed: item.push_failed_count,
                      pending: item.push_pending_count,
                    })}
                </span>
              );
            }
            if (item.channels.includes("push")) {
              return (
                <span className="text-sm text-subtle">
                  {m.admin_composer_estimated_audience({ count: item.estimated_push_audience })}
                </span>
              );
            }
            return null;
          },
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">{m.admin_composer_column_actions()}</span>,
          enableSorting: false,
          meta: { tdClassName: "text-right" },
          cell: ({ row }) => {
            const item = row.original;
            return (
              item.state === "draft" && (
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                    {m.admin_composer_edit_button()}
                  </Button>
                  <Button size="sm" variant="warning" onClick={() => void handleSend(item)}>
                    {m.admin_composer_send_button()}
                  </Button>
                </div>
              )
            );
          },
        }),
      ]),
    [startEdit, handleSend],
  );

  const table = useAppTable({ data: items, columns, getRowId: (row) => row.id }, () => ({}));

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-medium leading-tight mb-0">{m.admin_composer_section()}</h2>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="danger">{error}</Alert>}
        {confirmDialog}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="text_language">
            {(field) => (
              <OriginalLanguageSelect
                controlId="composer-text-language"
                label={m.admin_composer_original_language()}
                value={field.value}
                onChange={(language) => field.handleChange(language)}
              />
            )}
          </form.Field>
          <p className="text-sm text-subtle mb-2">{m.admin_composer_text_help()}</p>
          <div className="flex gap-2 mb-2">
            {(["nl", "en", "fr"] as const).map((locale) => (
              <Button
                key={locale}
                type="button"
                size="sm"
                variant={preview === locale ? "warning" : "outline"}
                onClick={() => setPreview(locale)}
              >
                {locale.toUpperCase()}
              </Button>
            ))}
          </div>
          <AdminField className="mb-2" controlId="composer-title">
            <AdminLabel>{m.admin_composer_title_label()}</AdminLabel>
            <form.Field name={`title_${preview}`}>
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
          <AdminField className="mb-2" controlId="composer-body">
            <AdminLabel>{m.admin_composer_body_label()}</AdminLabel>
            <form.Field name={`body_${preview}`}>
              {(field) => (
                <AdminTextarea
                  rows={3}
                  maxLength={500}
                  value={field.value ?? ""}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>

          <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2 mb-2">
            <AdminField className="site-md:w-4/12" controlId="composer-level">
              <AdminLabel>{m.admin_composer_level_label()}</AdminLabel>
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
            <AdminField className="site-md:w-8/12" controlId="composer-link-url">
              <AdminLabel>{m.admin_composer_link_url_label()}</AdminLabel>
              <form.Field name="link_url">
                {(field) => (
                  <AdminInput
                    type="url"
                    value={field.value ?? ""}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="https://…"
                  />
                )}
              </form.Field>
            </AdminField>
          </div>

          <form.Field name="channels">
            {(field) => (
              <div className="mb-4">
                <AdminLabel className="block">{m.admin_composer_channels_label()}</AdminLabel>
                <AdminCheck
                  inline
                  type="checkbox"
                  id="composer-channel-announcement"
                  label={m.admin_composer_channel_announcement()}
                  checked={field.value.includes("announcement")}
                  onCheckedChange={() =>
                    field.handleChange(
                      field.value.includes("announcement")
                        ? field.value.filter((c) => c !== "announcement")
                        : [...field.value, "announcement"],
                    )
                  }
                />
                <AdminCheck
                  inline
                  type="checkbox"
                  id="composer-channel-push"
                  label={m.admin_composer_channel_push()}
                  checked={field.value.includes("push")}
                  onCheckedChange={() =>
                    field.handleChange(
                      field.value.includes("push")
                        ? field.value.filter((c) => c !== "push")
                        : [...field.value, "push"],
                    )
                  }
                />
              </div>
            )}
          </form.Field>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="warning"
              disabled={channels.length === 0 || save.isPending}
            >
              {editing ? m.admin_composer_save_button() : m.admin_composer_create_button()}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  form.reset(emptyDraft);
                }}
              >
                {m.admin_composer_cancel_edit_button()}
              </Button>
            )}
          </div>
        </form>

        {items.length === 0 ? (
          <p className="text-center text-subtle mt-6 mb-0">{m.admin_composer_empty()}</p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
