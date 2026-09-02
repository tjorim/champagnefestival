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
      if (!response.ok) throw new Error("Announcements could not be loaded.");
      return response.json() as Promise<Announcement[]>;
    },
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<"nl" | "en" | "fr">("nl");
  const [error, setError] = useState("");
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
        "Announcement could not be saved.",
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
        "Announcement could not be deleted.",
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });
  const update = async (item: Announcement, values: Partial<Announcement>) =>
    fetchJsonOrThrowWithUnauthorized(
      `/api/announcements/${item.id}`,
      {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(writePayload({ ...item, ...values })),
      },
      "Announcement could not be updated.",
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
      "Announcements could not be reordered.",
    );
    await refresh();
  };
  const status = (item: Announcement) =>
    !item.active
      ? "Disabled"
      : item.starts_at && new Date(item.starts_at) > new Date()
        ? "Scheduled"
        : item.ends_at && new Date(item.ends_at) <= new Date()
          ? "Expired"
          : "Active";

  return (
    <Card className="admin-card">
      <Card.Header>
        <h2 className="h5 mb-0">Announcements</h2>
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
                <Form.Label>Text ({locale.toUpperCase()})</Form.Label>
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
              <Form.Label>Level</Form.Label>
              <Form.Select
                value={draft.level}
                onChange={(event) =>
                  setDraft({ ...draft, level: event.target.value as Draft["level"] })
                }
              >
                <option>info</option>
                <option>warning</option>
                <option>urgent</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="col-md-3">
              <Form.Label>Starts (local time)</Form.Label>
              <Form.Control
                type="datetime-local"
                value={localDate(draft.starts_at)}
                onChange={(event) => setDraft({ ...draft, starts_at: event.target.value || null })}
              />
            </Form.Group>
            <Form.Group className="col-md-3">
              <Form.Label>Ends (local time)</Form.Label>
              <Form.Control
                type="datetime-local"
                value={localDate(draft.ends_at)}
                onChange={(event) => setDraft({ ...draft, ends_at: event.target.value || null })}
              />
            </Form.Group>
            <Form.Group className="col-md-3">
              <Form.Label>Safe HTTPS link</Form.Label>
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
                <Form.Label>Link label ({locale.toUpperCase()})</Form.Label>
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
            label="Publish immediately"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          <div className="d-flex gap-2 mt-3">
            <Button type="submit" disabled={save.isPending}>
              {editing ? "Save" : "Create"}
            </Button>
            {editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setDraft(empty);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </Form>
        <hr />
        <Form.Select
          className="mb-3 w-auto"
          aria-label="Preview language"
          value={preview}
          onChange={(event) => setPreview(event.target.value as typeof preview)}
        >
          <option value="nl">Dutch preview</option>
          <option value="en">English preview</option>
          <option value="fr">French preview</option>
        </Form.Select>
        <Table responsive>
          <thead>
            <tr>
              <th>Order</th>
              <th>Preview</th>
              <th>Locales</th>
              <th>Status</th>
              <th>Actions</th>
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
                <td>{item[`text_${preview}`] || <em>Missing translation</em>}</td>
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
                  <Badge bg={status(item) === "Active" ? "success" : "secondary"}>
                    {status(item)}
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
                    Edit
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
                    {item.active ? "Disable" : "Publish"}
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      window.confirm("Delete this announcement?") && remove.mutate(item.id)
                    }
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
