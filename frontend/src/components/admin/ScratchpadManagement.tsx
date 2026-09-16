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
}: {
  authHeaders: () => Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const scratchpadQueryKey = queryKeys.admin.scratchpad;
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  const query = useQuery({
    queryKey: scratchpadQueryKey,
    queryFn: () =>
      fetchJsonOrThrowWithUnauthorized<ApiScratchpad>(
        "/api/scratchpad",
        { headers: authHeaders() },
        m.admin_error_load_scratchpad(),
      ),
  });

  // Seed the editable textarea once the content loads. Reset during render
  // (comparing against the previous query data) rather than in an effect,
  // since this only needs to react to that data actually changing — see
  // SettingsManagement for the same pattern.
  const [prevData, setPrevData] = useState(query.data);
  if (query.data !== prevData) {
    setPrevData(query.data);
    if (query.data) setContent(query.data.content);
  }

  const saveMutation = useMutation({
    mutationFn: (nextContent: string) =>
      fetchJsonOrThrowWithUnauthorized<ApiScratchpad>(
        "/api/scratchpad",
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
            <Button type="submit" variant="primary" disabled={saveMutation.isPending || !isDirty}>
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
      </Card.Body>
    </Card>
  );
}
