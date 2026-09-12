import { useMemo, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Table from "react-bootstrap/Table";

import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type ComposedMessageChannel = "announcement" | "push";
type ComposedMessageState = "draft" | "scheduled" | "sent";

interface ComposedMessage {
  id: string;
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

function stateBadgeVariant(state: ComposedMessageState): string {
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
  const { confirm, confirmDialog } = useConfirmDialog();
  const refresh = () => client.invalidateQueries({ queryKey: key });

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
  const channels = useStore(form.store, (s) => s.values.channels);

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

  const handleSend = async (item: ComposedMessage) => {
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
  };

  const startEdit = (item: ComposedMessage) => {
    setEditing(item.id);
  };

  return (
    <Card className="admin-card">
      <Card.Header>
        <h2 className="h5 mb-0">{m.admin_composer_section()}</h2>
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {confirmDialog}

        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="d-flex gap-2 mb-2">
            {(["nl", "en", "fr"] as const).map((locale) => (
              <Button
                key={locale}
                type="button"
                size="sm"
                variant={preview === locale ? "warning" : "outline-secondary"}
                onClick={() => setPreview(locale)}
              >
                {locale.toUpperCase()}
              </Button>
            ))}
          </div>
          <Form.Group className="mb-2" controlId="composer-title">
            <Form.Label>{m.admin_composer_title_label()}</Form.Label>
            <form.Field name={`title_${preview}`}>
              {(field) => (
                <Form.Control
                  maxLength={500}
                  value={field.state.value ?? ""}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>
          <Form.Group className="mb-2" controlId="composer-body">
            <Form.Label>{m.admin_composer_body_label()}</Form.Label>
            <form.Field name={`body_${preview}`}>
              {(field) => (
                <Form.Control
                  as="textarea"
                  rows={3}
                  maxLength={500}
                  value={field.state.value ?? ""}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>

          <div className="row g-2 mb-2">
            <Form.Group className="col-md-4" controlId="composer-level">
              <Form.Label>{m.admin_composer_level_label()}</Form.Label>
              <form.Field name="level">
                {(field) => (
                  <Form.Select
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value as Draft["level"])}
                    onBlur={field.handleBlur}
                  >
                    <option value="info">{m.admin_announcement_level_info()}</option>
                    <option value="warning">{m.admin_announcement_level_warning()}</option>
                    <option value="urgent">{m.admin_announcement_level_urgent()}</option>
                  </Form.Select>
                )}
              </form.Field>
            </Form.Group>
            <Form.Group className="col-md-8" controlId="composer-link-url">
              <Form.Label>{m.admin_composer_link_url_label()}</Form.Label>
              <form.Field name="link_url">
                {(field) => (
                  <Form.Control
                    type="url"
                    value={field.state.value ?? ""}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="https://…"
                  />
                )}
              </form.Field>
            </Form.Group>
          </div>

          <form.Field name="channels">
            {(field) => (
              <div className="mb-3">
                <Form.Label className="d-block">{m.admin_composer_channels_label()}</Form.Label>
                <Form.Check
                  inline
                  type="checkbox"
                  id="composer-channel-announcement"
                  label={m.admin_composer_channel_announcement()}
                  checked={field.state.value.includes("announcement")}
                  onChange={() =>
                    field.handleChange(
                      field.state.value.includes("announcement")
                        ? field.state.value.filter((c) => c !== "announcement")
                        : [...field.state.value, "announcement"],
                    )
                  }
                />
                <Form.Check
                  inline
                  type="checkbox"
                  id="composer-channel-push"
                  label={m.admin_composer_channel_push()}
                  checked={field.state.value.includes("push")}
                  onChange={() =>
                    field.handleChange(
                      field.state.value.includes("push")
                        ? field.state.value.filter((c) => c !== "push")
                        : [...field.state.value, "push"],
                    )
                  }
                />
              </div>
            )}
          </form.Field>

          <div className="d-flex gap-2">
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
                variant="outline-secondary"
                onClick={() => {
                  setEditing(null);
                  form.reset(emptyDraft);
                }}
              >
                {m.admin_composer_cancel_edit_button()}
              </Button>
            )}
          </div>
        </Form>

        <Table responsive className="mt-4 align-middle">
          <thead>
            <tr>
              <th>{m.admin_composer_column_title()}</th>
              <th>{m.admin_composer_column_channels()}</th>
              <th>{m.admin_composer_column_state()}</th>
              <th>{m.admin_composer_column_results()}</th>
              <th>
                <span className="visually-hidden">{m.admin_composer_column_actions()}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.title_nl || item.title_en || item.title_fr}</td>
                <td>{item.channels.join(", ")}</td>
                <td>
                  <Badge bg={stateBadgeVariant(item.state)}>{item.state}</Badge>
                </td>
                <td>
                  {item.state === "sent" ? (
                    <span className="small">
                      {item.channels.includes("push") &&
                        m.admin_composer_push_results({
                          delivered: item.push_delivered_count,
                          failed: item.push_failed_count,
                          pending: item.push_pending_count,
                        })}
                    </span>
                  ) : item.channels.includes("push") ? (
                    <span className="small text-secondary">
                      {m.admin_composer_estimated_audience({ count: item.estimated_push_audience })}
                    </span>
                  ) : null}
                </td>
                <td className="text-end">
                  {item.state === "draft" && (
                    <div className="d-flex gap-2 justify-content-end">
                      <Button size="sm" variant="outline-secondary" onClick={() => startEdit(item)}>
                        {m.admin_composer_edit_button()}
                      </Button>
                      <Button size="sm" variant="warning" onClick={() => void handleSend(item)}>
                        {m.admin_composer_send_button()}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-secondary">
                  {m.admin_composer_empty()}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
