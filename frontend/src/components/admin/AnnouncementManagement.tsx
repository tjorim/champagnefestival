import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Table from "react-bootstrap/Table";

import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

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
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<"nl" | "en" | "fr">("nl");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog();
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: () =>
      fetchJsonOrThrowWithUnauthorized(
        `/api/announcements${editing ? `/${editing}` : ""}`,
        {
          method: editing ? "PUT" : "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            ...writePayload(draft),
            starts_at: iso(draft.starts_at),
            ends_at: iso(draft.ends_at),
            link_url: draft.link_url || null,
          }),
        },
        m.admin_error_save_announcement(),
      ),
    onSuccess: () => {
      setDraft(empty);
      setEditing(null);
      void refresh();
    },
    retry: false,
  });
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
  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: m.admin_announcement_delete_title(),
      body: m.admin_announcement_delete_confirm(),
      errorFallback: m.admin_error_delete_announcement(),
    });
    if (confirmed) remove.mutate(id);
  };
  const update = async (item: Announcement, values: Partial<Announcement>) =>
    fetchJsonOrThrowWithUnauthorized(
      `/api/announcements/${item.id}`,
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(writePayload({ ...item, ...values })),
      },
      m.admin_error_update_announcement(),
    );
  const move = async (index: number, direction: number) => {
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
  };
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

  return (
    <Card className="admin-card">
      <Card.Header>
        <h2 className="h5 mb-0">{m.admin_announcements_section()}</h2>
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            void save.mutateAsync().catch((reason) => setError(String(reason)));
          }}
        >
          <div className="row g-2">
            {(["nl", "en", "fr"] as const).map((locale) => (
              <Form.Group className="col-md-4" key={locale}>
                <Form.Label>
                  {m.admin_announcement_text_label({ locale: locale.toUpperCase() })}
                </Form.Label>
                <Form.Control
                  maxLength={500}
                  value={draft[`text_${locale}`] ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, [`text_${locale}`]: event.target.value })
                  }
                />
              </Form.Group>
            ))}
          </div>
          <div className="row g-2 mt-1">
            <Form.Group className="col-md-3">
              <Form.Label>{m.admin_announcement_level_label()}</Form.Label>
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
            <Form.Group className="col-md-3">
              <Form.Label>{m.admin_announcement_starts_label()}</Form.Label>
              <Form.Control
                type="datetime-local"
                value={localDate(draft.starts_at)}
                onChange={(event) => setDraft({ ...draft, starts_at: event.target.value || null })}
              />
            </Form.Group>
            <Form.Group className="col-md-3">
              <Form.Label>{m.admin_announcement_ends_label()}</Form.Label>
              <Form.Control
                type="datetime-local"
                value={localDate(draft.ends_at)}
                onChange={(event) => setDraft({ ...draft, ends_at: event.target.value || null })}
              />
            </Form.Group>
            <Form.Group className="col-md-3">
              <Form.Label>{m.admin_announcement_link_url_label()}</Form.Label>
              <Form.Control
                type="url"
                value={draft.link_url ?? ""}
                onChange={(event) => setDraft({ ...draft, link_url: event.target.value })}
              />
            </Form.Group>
          </div>
          <div className="row g-2 mt-1">
            {(["nl", "en", "fr"] as const).map((locale) => (
              <Form.Group className="col-md-4" key={locale}>
                <Form.Label>
                  {m.admin_announcement_link_label_field({ locale: locale.toUpperCase() })}
                </Form.Label>
                <Form.Control
                  value={draft[`link_label_${locale}`] ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, [`link_label_${locale}`]: event.target.value })
                  }
                />
              </Form.Group>
            ))}
          </div>
          <Form.Check
            className="mt-3"
            label={m.admin_announcement_publish_immediately()}
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          <div className="d-flex gap-2 mt-3">
            <Button type="submit" disabled={save.isPending}>
              {editing ? m.admin_save() : m.admin_create_action()}
            </Button>
            {editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setDraft(empty);
                }}
              >
                {m.admin_action_cancel()}
              </Button>
            )}
          </div>
        </Form>
        <hr />
        <Form.Select
          className="mb-3 w-auto"
          aria-label={m.admin_announcement_preview_language_label()}
          value={preview}
          onChange={(event) => setPreview(event.target.value as typeof preview)}
        >
          <option value="nl">{m.admin_announcement_preview_nl()}</option>
          <option value="en">{m.admin_announcement_preview_en()}</option>
          <option value="fr">{m.admin_announcement_preview_fr()}</option>
        </Form.Select>
        <Table responsive>
          <thead>
            <tr>
              <th>{m.admin_announcement_order_column()}</th>
              <th>{m.admin_announcement_preview_column()}</th>
              <th>{m.admin_announcement_locales_column()}</th>
              <th>{m.admin_status_label()}</th>
              <th>{m.admin_actions_label()}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={!index}
                    onClick={() => void move(index, -1)}
                  >
                    ↑
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={index === items.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    ↓
                  </Button>
                </td>
                <td>
                  {item[`text_${preview}`] || <em>{m.admin_announcement_missing_translation()}</em>}
                </td>
                <td>
                  {(["nl", "en", "fr"] as const).map((locale) => (
                    <Badge
                      className="me-1"
                      bg={item[`text_${locale}`] ? "success" : "secondary"}
                      key={locale}
                    >
                      {locale}
                    </Badge>
                  ))}
                </td>
                <td>
                  <Badge bg={status(item) === "active" ? "success" : "secondary"}>
                    {statusLabel(status(item))}
                  </Badge>
                </td>
                <td className="text-nowrap">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(item.id);
                      setDraft({
                        ...item,
                        starts_at: localDate(item.starts_at),
                        ends_at: localDate(item.ends_at),
                      });
                    }}
                  >
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
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card.Body>
      {confirmDialog}
    </Card>
  );
}
