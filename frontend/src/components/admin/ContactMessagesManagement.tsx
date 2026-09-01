import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { fetchArrayOrThrow, fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
  handledAt: string | null;
}

const mapMessage = (item: Record<string, unknown>): ContactMessage => ({
  id: String(item.id),
  name: String(item.name),
  email: String(item.email),
  message: String(item.message),
  createdAt: String(item.created_at),
  handledAt: item.handled_at == null ? null : String(item.handled_at),
});

export default function ContactMessagesManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const messages = useQuery({
    queryKey: queryKeys.admin.contactMessages,
    queryFn: () =>
      fetchArrayOrThrow(
        "/api/contact",
        { headers: authHeaders() },
        m.admin_error_load_contact_messages(),
        mapMessage,
      ),
  });
  const handled = useMutation({
    mutationFn: (id: string) =>
      fetchJsonOrThrowWithUnauthorized<ContactMessage>(
        `/api/contact/${id}/handled`,
        { method: "PUT", headers: authHeaders() },
        m.admin_error_handle_contact_message(),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.contactMessages }),
    retry: false,
  });

  return (
    <Card bg="dark" text="white" border="secondary">
      <Card.Header className="fw-semibold">{m.admin_contact_messages_section()}</Card.Header>
      <Card.Body>
        {messages.isPending && <Spinner animation="border" size="sm" />}
        {messages.isError && (
          <Alert variant="danger">{m.admin_error_load_contact_messages()}</Alert>
        )}
        {handled.isError && (
          <Alert variant="danger">{m.admin_error_handle_contact_message()}</Alert>
        )}
        {messages.data?.length === 0 && (
          <p className="text-secondary mb-0">{m.admin_contact_messages_empty()}</p>
        )}
        {messages.data?.map((message) => (
          <article key={message.id} className="border-bottom border-secondary pb-3 mb-3">
            <div className="d-flex justify-content-between gap-3 flex-wrap">
              <div>
                <strong>{message.name}</strong>{" "}
                <a href={`mailto:${message.email}`}>{message.email}</a>
                <div className="small text-secondary">
                  {new Date(message.createdAt).toLocaleString()}
                </div>
              </div>
              {message.handledAt ? (
                <span className="text-success">{m.admin_contact_message_handled()}</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline-success"
                  onClick={() => handled.mutate(message.id)}
                >
                  {m.admin_contact_message_mark_handled()}
                </Button>
              )}
            </div>
            <p className="mt-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>
              {message.message}
            </p>
          </article>
        ))}
      </Card.Body>
    </Card>
  );
}
