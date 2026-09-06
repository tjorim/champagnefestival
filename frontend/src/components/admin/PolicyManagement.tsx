import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Nav from "react-bootstrap/Nav";
import Table from "react-bootstrap/Table";

import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type Locale = "nl" | "en" | "fr";
const LOCALES: Locale[] = ["nl", "en", "fr"];

interface PolicyVersion {
  id: string;
  policy_key: string;
  version_number: number;
  status: "draft" | "published" | "superseded";
  content_nl: string | null;
  content_en: string | null;
  content_fr: string | null;
  change_summary: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  published_at: string | null;
  published_by: string | null;
}

interface Policy {
  key: string;
  title_nl: string;
  title_en: string | null;
  title_fr: string | null;
  required_locales: Locale[];
  versions: PolicyVersion[];
}

const POLICY_KEY = "privacy";

function contentFor(version: PolicyVersion | undefined, locale: Locale): string {
  if (!version) return "";
  return version[`content_${locale}`] ?? "";
}

function statusVariant(status: PolicyVersion["status"]): string {
  switch (status) {
    case "draft":
      return "warning";
    case "published":
      return "success";
    default:
      return "secondary";
  }
}

function statusLabel(status: PolicyVersion["status"]): string {
  switch (status) {
    case "draft":
      return m.admin_policy_status_draft();
    case "published":
      return m.admin_policy_status_published();
    default:
      return m.admin_policy_status_superseded();
  }
}

/** Wraps or inserts Markdown syntax around the current textarea selection. */
export function applyMarkdownSnippet(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
): string {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const next =
    value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = selectionStart + before.length;
    textarea.setSelectionRange(cursor, cursor + selected.length);
  });
  return next;
}

export default function PolicyManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const client = useQueryClient();
  const key = queryKeys.admin.policy(POLICY_KEY);
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      fetchJsonOrThrowWithUnauthorized<Policy>(
        `/api/policies/${POLICY_KEY}`,
        { headers: authHeaders() },
        m.admin_error_load_policy(),
      ),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });

  const policy = query.data;
  const draft = useMemo(() => policy?.versions.find((v) => v.status === "draft"), [policy]);
  const published = useMemo(() => policy?.versions.find((v) => v.status === "published"), [policy]);
  const history = useMemo(
    () =>
      (policy?.versions ?? [])
        .filter((v) => v.status !== "draft")
        .sort((a, b) => b.version_number - a.version_number),
    [policy],
  );

  const [locale, setLocale] = useState<Locale>("nl");
  const [contentByLocale, setContentByLocale] = useState<Record<Locale, string>>({
    nl: "",
    en: "",
    fr: "",
  });
  const [changeSummary, setChangeSummary] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load the open draft's content into the editor whenever it (re)appears.
  // Reset during render rather than in an effect (the "adjusting state when a
  // prop changes" pattern, see PersonFormModal) since this only needs to react
  // to the draft identity changing, not to every refetch of the same draft —
  // a background refresh after saveDraft must not stomp on unsaved edits.
  const [lastDraftId, setLastDraftId] = useState(draft?.id);
  if (draft?.id !== lastDraftId) {
    setLastDraftId(draft?.id);
    setContentByLocale({
      nl: draft?.content_nl ?? "",
      en: draft?.content_en ?? "",
      fr: draft?.content_fr ?? "",
    });
    setChangeSummary(draft?.change_summary ?? "");
  }

  // Live preview: render the currently-edited locale's content through the
  // same backend renderer/sanitizer used for public output (#944), debounced
  // so every keystroke doesn't round-trip to the server.
  useEffect(() => {
    const markdown = contentByLocale[locale];
    if (!markdown.trim()) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchJsonOrThrowWithUnauthorized<{ html: string }>(
        "/api/policies/render",
        { method: "POST", headers: authHeaders(), body: JSON.stringify({ markdown }) },
        m.admin_error_render_preview(),
      )
        .then((result) => {
          if (!cancelled) setPreview(result.html);
        })
        .catch(() => {
          if (!cancelled) setPreview("");
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contentByLocale, locale, authHeaders]);

  const createDraft = useMutation({
    mutationFn: (sourceVersionNumber?: number) =>
      fetchJsonOrThrowWithUnauthorized<PolicyVersion>(
        `/api/policies/${POLICY_KEY}/draft`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ source_version_number: sourceVersionNumber ?? null }),
        },
        m.admin_error_create_draft(),
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });

  const saveDraft = useMutation({
    mutationFn: () =>
      fetchJsonOrThrowWithUnauthorized<PolicyVersion>(
        `/api/policies/${POLICY_KEY}/draft`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            content_nl: contentByLocale.nl || null,
            content_en: contentByLocale.en || null,
            content_fr: contentByLocale.fr || null,
            change_summary: changeSummary || null,
          }),
        },
        m.admin_error_save_draft(),
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });

  const discardDraft = useMutation({
    mutationFn: () =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/policies/${POLICY_KEY}/draft`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_discard_draft_request(),
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });

  const publishDraft = useMutation({
    mutationFn: () =>
      fetchJsonOrThrowWithUnauthorized<PolicyVersion>(
        `/api/policies/${POLICY_KEY}/draft/publish`,
        { method: "POST", headers: authHeaders() },
        m.admin_error_publish_draft_request(),
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });

  const handleCreateDraft = (sourceVersionNumber?: number) => {
    setError("");
    createDraft.mutate(sourceVersionNumber, { onError: (reason) => setError(String(reason)) });
  };
  const handleSaveDraft = () => {
    setError("");
    saveDraft.mutate(undefined, { onError: (reason) => setError(String(reason)) });
  };
  const handleDiscardDraft = async () => {
    const confirmed = await confirm({
      title: m.admin_policy_discard_title(),
      body: m.admin_policy_discard_confirm(),
      confirmLabel: m.admin_policy_discard_action(),
      errorFallback: m.admin_error_discard_policy(),
    });
    if (!confirmed) return;
    setError("");
    discardDraft.mutate(undefined, { onError: (reason) => setError(String(reason)) });
  };
  const handlePublishDraft = async () => {
    const confirmed = await confirm({
      title: m.admin_policy_publish_title(),
      body: m.admin_policy_publish_confirm(),
      confirmLabel: m.admin_policy_publish_action(),
      variant: "warning",
      icon: "megaphone",
      errorFallback: m.admin_error_publish_policy(),
    });
    if (!confirmed) return;
    setError("");
    publishDraft.mutate(undefined, { onError: (reason) => setError(String(reason)) });
  };

  const insertSnippet = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = applyMarkdownSnippet(textarea, before, after, placeholder);
    setContentByLocale((prev) => ({ ...prev, [locale]: next }));
  };

  if (query.isLoading) return null;

  return (
    <Card className="admin-card">
      <Card.Header>
        <h2 className="h5 mb-0">{m.admin_policies_section()}</h2>
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {query.isError && <Alert variant="danger">{m.admin_error_load_policy()}</Alert>}
        {policy && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <strong>{policy.title_en ?? policy.title_nl}</strong>{" "}
                <span className="text-secondary">
                  {m.admin_policy_required_locales_label()}{" "}
                  {LOCALES.map((l) => (
                    <Badge
                      key={l}
                      bg={policy.required_locales.includes(l) ? "info" : "secondary"}
                      className="me-1"
                    >
                      {l}
                    </Badge>
                  ))}
                </span>
                {published && (
                  <div className="text-secondary small">
                    {m.admin_policy_currently_published({
                      version: published.version_number,
                      date: published.published_at
                        ? new Date(published.published_at).toLocaleDateString()
                        : "—",
                    })}
                  </div>
                )}
              </div>
              {!draft && (
                <Button size="sm" onClick={() => handleCreateDraft()}>
                  {m.admin_policy_create_draft_action()}
                </Button>
              )}
            </div>

            {draft ? (
              <>
                <div className="mb-2 text-secondary small">
                  {m.admin_policy_editing_draft_label({ version: draft.version_number })}{" "}
                  {LOCALES.map((l) => (
                    <Badge
                      key={l}
                      bg={contentByLocale[l]?.trim() ? "success" : "secondary"}
                      className="me-1"
                    >
                      {l}
                    </Badge>
                  ))}
                </div>
                <Nav
                  variant="tabs"
                  activeKey={locale}
                  onSelect={(k) => setLocale((k as Locale) ?? "nl")}
                >
                  {LOCALES.map((l) => (
                    <Nav.Item key={l}>
                      <Nav.Link eventKey={l}>{l.toUpperCase()}</Nav.Link>
                    </Nav.Item>
                  ))}
                </Nav>
                <div className="border border-top-0 p-3">
                  <ButtonGroup size="sm" className="mb-2">
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("**", "**", "bold text")}
                    >
                      {m.admin_policy_markdown_bold()}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("_", "_", "italic text")}
                    >
                      {m.admin_policy_markdown_italic()}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("## ", "", "Heading")}
                    >
                      {m.admin_policy_markdown_h2()}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("### ", "", "Heading")}
                    >
                      {m.admin_policy_markdown_h3()}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("[", "](https://example.com)", "link text")}
                    >
                      {m.admin_policy_markdown_link()}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("- ", "", "List item")}
                    >
                      {m.admin_policy_markdown_list()}
                    </Button>
                  </ButtonGroup>
                  <Form.Control
                    ref={textareaRef}
                    as="textarea"
                    rows={12}
                    className="font-monospace"
                    value={contentByLocale[locale]}
                    onChange={(event) =>
                      setContentByLocale((prev) => ({ ...prev, [locale]: event.target.value }))
                    }
                  />
                  <div className="row mt-3">
                    <div className="col-md-6">
                      <Form.Label className="small text-secondary">
                        {m.admin_policy_preview_label()}
                      </Form.Label>
                      <div
                        className="border rounded p-3 bg-body-tertiary"
                        style={{ minHeight: "8rem" }}
                        // Trusted: `preview` is always the sanitized HTML the
                        // backend's shared render_markdown() returned. Blanked
                        // here (not via setState in the effect above) once the
                        // markdown is empty, so clearing the box doesn't wait
                        // on the debounce timer.
                        dangerouslySetInnerHTML={{
                          __html: contentByLocale[locale].trim() ? preview : "",
                        }}
                      />
                    </div>
                    <div className="col-md-6">
                      <Form.Label className="small text-secondary">
                        {m.admin_policy_change_summary_label()}
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={4}
                        value={changeSummary}
                        onChange={(event) => setChangeSummary(event.target.value)}
                        placeholder={m.admin_policy_change_summary_placeholder()}
                      />
                    </div>
                  </div>
                  <div className="d-flex gap-2 mt-3">
                    <Button disabled={saveDraft.isPending} onClick={handleSaveDraft}>
                      {m.admin_policy_save_draft_action()}
                    </Button>
                    <Button
                      variant="success"
                      disabled={publishDraft.isPending}
                      onClick={() => void handlePublishDraft()}
                    >
                      {m.admin_policy_publish_action()}
                    </Button>
                    <Button
                      variant="outline-danger"
                      disabled={discardDraft.isPending}
                      onClick={() => void handleDiscardDraft()}
                    >
                      {m.admin_policy_discard_draft_action()}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <Alert variant="secondary">{m.admin_policy_no_draft_message()}</Alert>
            )}

            <hr />
            <h3 className="h6">{m.admin_policy_version_history_heading()}</h3>
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th>{m.admin_policy_version_column()}</th>
                  <th>{m.admin_status_label()}</th>
                  <th>{m.admin_policy_published_column()}</th>
                  <th>{m.admin_policy_by_column()}</th>
                  <th>{m.admin_policy_change_summary_column()}</th>
                  <th>{m.admin_actions_label()}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((version) => (
                  <tr key={version.id}>
                    <td>{version.version_number}</td>
                    <td>
                      <Badge bg={statusVariant(version.status)}>
                        {statusLabel(version.status)}
                      </Badge>
                    </td>
                    <td>
                      {version.published_at ? new Date(version.published_at).toLocaleString() : "—"}
                    </td>
                    <td>{version.published_by ?? version.created_by}</td>
                    <td>{version.change_summary ?? "—"}</td>
                    <td>
                      {version.status === "superseded" && !draft && (
                        <Button
                          size="sm"
                          variant="outline-warning"
                          onClick={() => handleCreateDraft(version.version_number)}
                        >
                          {m.admin_policy_rollback_action()}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {contentFor(published, locale) === "" && published && (
              <p className="text-secondary small">
                {m.admin_policy_no_published_content({ locale: locale.toUpperCase() })}
              </p>
            )}
          </>
        )}
      </Card.Body>
      {confirmDialog}
    </Card>
  );
}
