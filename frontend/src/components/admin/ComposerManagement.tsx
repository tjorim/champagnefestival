import { useState } from "react";
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
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<"nl" | "en" | "fr">("nl");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog();
  const refresh = () => client.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: () =>
      fetchJsonOrThrowWithUnauthorized(
        `/api/composer${editing ? `/${editing}` : ""}`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(writePayload(draft)),
        },
        m.admin_composer_error_save(),
      ),
    onSuccess: () => {
      setDraft(emptyDraft);
      setEditing(null);
      void refresh();
    },
    retry: false,
  });

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
    setDraft({
      title_nl: item.title_nl,
      title_en: item.title_en,
      title_fr: item.title_fr,
      body_nl: item.body_nl,
      body_en: item.body_en,
      body_fr: item.body_fr,
      level: item.level,
      channels: item.channels,
      link_url: item.link_url,
    });
  };

  const toggleChannel = (channel: ComposedMessageChannel) => {
    setDraft((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((c) => c !== channel)
        : [...current.channels, channel],
    }));
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
            setError("");
            void save.mutateAsync().catch((reason) => setError(String(reason)));
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
            <Form.Control
              maxLength={500}
              value={draft[`title_${preview}`] ?? ""}
              onChange={(event) => setDraft({ ...draft, [`title_${preview}`]: event.target.value })}
            />
          </Form.Group>
          <Form.Group className="mb-2" controlId="composer-body">
            <Form.Label>{m.admin_composer_body_label()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              maxLength={500}
              value={draft[`body_${preview}`] ?? ""}
              onChange={(event) => setDraft({ ...draft, [`body_${preview}`]: event.target.value })}
            />
          </Form.Group>

          <div className="row g-2 mb-2">
            <Form.Group className="col-md-4" controlId="composer-level">
              <Form.Label>{m.admin_composer_level_label()}</Form.Label>
              <Form.Select
                value={draft.level}
                onChange={(event) =>
                  setDraft({ ...draft, level: event.target.value as Draft["level"] })
                }
              >
                <option value="info">{m.admin_announcement_level_info()}</option>
                <option value="warning">{m.admin_announcement_level_warning()}</option>
                <option value="urgent">{m.admin_announcement_level_urgent()}</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="col-md-8" controlId="composer-link-url">
              <Form.Label>{m.admin_composer_link_url_label()}</Form.Label>
              <Form.Control
                type="url"
                value={draft.link_url ?? ""}
                onChange={(event) => setDraft({ ...draft, link_url: event.target.value })}
                placeholder="https://…"
              />
            </Form.Group>
          </div>

          <div className="mb-3">
            <Form.Label className="d-block">{m.admin_composer_channels_label()}</Form.Label>
            <Form.Check
              inline
              type="checkbox"
              id="composer-channel-announcement"
              label={m.admin_composer_channel_announcement()}
              checked={draft.channels.includes("announcement")}
              onChange={() => toggleChannel("announcement")}
            />
            <Form.Check
              inline
              type="checkbox"
              id="composer-channel-push"
              label={m.admin_composer_channel_push()}
              checked={draft.channels.includes("push")}
              onChange={() => toggleChannel("push")}
            />
          </div>

          <div className="d-flex gap-2">
            <Button type="submit" variant="warning" disabled={draft.channels.length === 0}>
              {editing ? m.admin_composer_save_button() : m.admin_composer_create_button()}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline-secondary"
                onClick={() => {
                  setEditing(null);
                  setDraft(emptyDraft);
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
