import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";

interface ApiScratchpad {
  content: string;
}

export default function ScratchpadManagement({
  authHeaders,
  editionId,
}: {
  authHeaders: () => Record<string, string>;
  /** The active edition's id — the scratchpad is scoped per edition, not a
   * single global notepad, so it doesn't accumulate clutter across editions
   * the way a person-level notes field would. Empty when there's no active
   * edition. */
  editionId: string;
}) {
  const queryClient = useQueryClient();
  const scratchpadQueryKey = queryKeys.admin.editionScratchpad(editionId);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  const query = useQuery({
    queryKey: scratchpadQueryKey,
    queryFn: () =>
      fetchJsonOrThrowWithUnauthorized<ApiScratchpad>(
        `/api/editions/${editionId}/scratchpad`,
        { headers: authHeaders() },
        m.admin_error_load_scratchpad(),
      ),
    enabled: editionId !== "",
  });

  // Seed the editable textarea once the content loads, and re-seed if the
  // active edition itself changes. Reset during render (comparing against
  // the previous query key/data) rather than in an effect, since this only
  // needs to react to those actually changing — see SettingsManagement for
  // the same pattern.
  const [prevKey, setPrevKey] = useState(scratchpadQueryKey.join("|"));
  const [prevData, setPrevData] = useState(query.data);
  const currentKey = scratchpadQueryKey.join("|");
  if (currentKey !== prevKey) {
    // Switched to a different edition: fully reseed, including the stale
    // "Saved." banner from whatever was previously open.
    setPrevKey(currentKey);
    setPrevData(query.data);
    setContent(query.data?.content ?? "");
    setSaved(false);
  } else if (query.data !== prevData) {
    // Same edition — either the initial load resolving, our own successful
    // save writing back through the cache, or a background refetch. Only
    // reseed content when it still matches what was previously loaded — a
    // refetch racing an in-progress, not-yet-saved edit must not clobber it.
    // Never touch `saved` here: doing so would immediately clear the
    // "Saved." confirmation onSuccess just set.
    const previousContent = prevData?.content ?? "";
    setPrevData(query.data);
    if (query.data && content === previousContent) setContent(query.data.content);
  }

  const saveMutation = useMutation({
    mutationFn: (nextContent: string) =>
      fetchJsonOrThrowWithUnauthorized<ApiScratchpad>(
        `/api/editions/${editionId}/scratchpad`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ content: nextContent }),
        },
        m.admin_error_save_scratchpad(),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(scratchpadQueryKey, data);
      setSaved(true);
    },
    retry: false,
  });

  const isDirty = query.data != null && content !== query.data.content;

  return (
    <Card bg="dark" text="white" border="secondary">
      <Card.Header className="fw-semibold">{m.admin_scratchpad_section()}</Card.Header>
      <Card.Body>
        <p className="text-secondary small">{m.admin_scratchpad_description()}</p>
        {editionId === "" ? (
          <p className="text-secondary mb-0">{m.admin_scratchpad_no_active_edition()}</p>
        ) : (
          <>
            {query.isError && <Alert variant="danger">{m.admin_error_load_scratchpad()}</Alert>}
            {saveMutation.isError && (
              <Alert variant="danger">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : m.admin_error_save_scratchpad()}
              </Alert>
            )}
            {saved && !saveMutation.isError && (
              <Alert variant="success" dismissible onClose={() => setSaved(false)}>
                {m.admin_scratchpad_saved()}
              </Alert>
            )}
            {query.isPending ? (
              <Spinner animation="border" size="sm" />
            ) : (
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSaved(false);
                  saveMutation.mutate(content);
                }}
              >
                <Form.Group className="mb-3" controlId="admin-scratchpad-content">
                  <Form.Control
                    as="textarea"
                    rows={16}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      setSaved(false);
                    }}
                    placeholder={m.admin_scratchpad_placeholder()}
                    className="bg-dark text-light border-secondary"
                    style={{ fontFamily: "monospace" }}
                    maxLength={20000}
                  />
                </Form.Group>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saveMutation.isPending || !isDirty}
                >
                  {saveMutation.isPending ? (
                    <>
                      <Spinner as="span" animation="border" size="sm" className="me-1" />
                      {m.admin_scratchpad_saving()}
                    </>
                  ) : (
                    m.admin_scratchpad_save()
                  )}
                </Button>
              </Form>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
