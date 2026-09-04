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
        "Policy could not be loaded.",
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load the open draft's content into the editor whenever it (re)appears.
  useEffect(() => {
    if (!draft) {
      setContentByLocale({ nl: "", en: "", fr: "" });
      setChangeSummary("");
      return;
    }
    setContentByLocale({
      nl: draft.content_nl ?? "",
      en: draft.content_en ?? "",
      fr: draft.content_fr ?? "",
    });
    setChangeSummary(draft.change_summary ?? "");
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview: render the currently-edited locale's content through the
  // same backend renderer/sanitizer used for public output (#944), debounced
  // so every keystroke doesn't round-trip to the server.
  useEffect(() => {
    const markdown = contentByLocale[locale];
    if (!markdown.trim()) {
      setPreview("");
      return;
    }
    const timer = window.setTimeout(() => {
      fetchJsonOrThrowWithUnauthorized<{ html: string }>(
        "/api/policies/render",
        { method: "POST", headers: authHeaders(), body: JSON.stringify({ markdown }) },
        "Preview could not be rendered.",
      )
        .then((result) => setPreview(result.html))
        .catch(() => setPreview(""));
    }, 400);
    return () => window.clearTimeout(timer);
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
        "Draft could not be created.",
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
        "Draft could not be saved.",
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });

  const discardDraft = useMutation({
    mutationFn: () =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/policies/${POLICY_KEY}/draft`,
        { method: "DELETE", headers: authHeaders() },
        "Draft could not be discarded.",
      ),
    onSuccess: () => void refresh(),
    retry: false,
  });

  const publishDraft = useMutation({
    mutationFn: () =>
      fetchJsonOrThrowWithUnauthorized<PolicyVersion>(
        `/api/policies/${POLICY_KEY}/draft/publish`,
        { method: "POST", headers: authHeaders() },
        "Draft could not be published.",
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
  const handleDiscardDraft = () => {
    setError("");
    discardDraft.mutate(undefined, { onError: (reason) => setError(String(reason)) });
  };
  const handlePublishDraft = () => {
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
        <h2 className="h5 mb-0">Legal Policies</h2>
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {query.isError && <Alert variant="danger">Policy could not be loaded.</Alert>}
        {policy && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <strong>{policy.title_en ?? policy.title_nl}</strong>{" "}
                <span className="text-secondary">
                  — required locales:{" "}
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
                    Currently published: version {published.version_number}, last updated{" "}
                    {published.published_at
                      ? new Date(published.published_at).toLocaleDateString()
                      : "—"}
                  </div>
                )}
              </div>
              {!draft && (
                <Button size="sm" onClick={() => handleCreateDraft()}>
                  Create draft from current version
                </Button>
              )}
            </div>

            {draft ? (
              <>
                <div className="mb-2 text-secondary small">
                  Editing draft version {draft.version_number} — locales:{" "}
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
                      Bold
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("_", "_", "italic text")}
                    >
                      Italic
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("## ", "", "Heading")}
                    >
                      H2
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("### ", "", "Heading")}
                    >
                      H3
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("[", "](https://example.com)", "link text")}
                    >
                      Link
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => insertSnippet("- ", "", "List item")}
                    >
                      List
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
                        Preview (rendered with the public renderer/sanitizer)
                      </Form.Label>
                      <div
                        className="border rounded p-3 bg-body-tertiary"
                        style={{ minHeight: "8rem" }}
                        // Trusted: `preview` is always the sanitized HTML the
                        // backend's shared render_markdown() returned.
                        dangerouslySetInnerHTML={{ __html: preview }}
                      />
                    </div>
                    <div className="col-md-6">
                      <Form.Label className="small text-secondary">
                        Internal change summary (optional)
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={4}
                        value={changeSummary}
                        onChange={(event) => setChangeSummary(event.target.value)}
                        placeholder="Why is this version changing? Not shown publicly."
                      />
                    </div>
                  </div>
                  <div className="d-flex gap-2 mt-3">
                    <Button disabled={saveDraft.isPending} onClick={handleSaveDraft}>
                      Save draft
                    </Button>
                    <Button
                      variant="success"
                      disabled={publishDraft.isPending}
                      onClick={() => {
                        if (
                          window.confirm("Publish this draft? Published versions are immutable.")
                        ) {
                          handlePublishDraft();
                        }
                      }}
                    >
                      Publish
                    </Button>
                    <Button
                      variant="outline-danger"
                      disabled={discardDraft.isPending}
                      onClick={() => window.confirm("Discard this draft?") && handleDiscardDraft()}
                    >
                      Discard draft
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <Alert variant="secondary">
                No open draft. Create one from the current published version, or roll back to an
                older version below.
              </Alert>
            )}

            <hr />
            <h3 className="h6">Version history</h3>
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Published</th>
                  <th>By</th>
                  <th>Change summary</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((version) => (
                  <tr key={version.id}>
                    <td>{version.version_number}</td>
                    <td>
                      <Badge bg={statusVariant(version.status)}>{version.status}</Badge>
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
                          Roll back to this version
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {contentFor(published, locale) === "" && published && (
              <p className="text-secondary small">
                No published content for {locale.toUpperCase()} yet.
              </p>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
