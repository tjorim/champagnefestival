import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
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
    <Card tone="secondary">
      <CardHeader className="font-semibold">{m.admin_contact_messages_section()}</CardHeader>
      <CardContent>
        {messages.isPending && <Spinner label={m.admin_loading()} size="sm" />}
        {messages.isError && (
          <Alert variant="danger">{m.admin_error_load_contact_messages()}</Alert>
        )}
        {handled.isError && (
          <Alert variant="danger">{m.admin_error_handle_contact_message()}</Alert>
        )}
        {messages.data?.length === 0 && (
          <p className="text-subtle mb-0">{m.admin_contact_messages_empty()}</p>
        )}
        {messages.data?.map((message) => (
          <article key={message.id} className="border-b border-subtle pb-4 mb-4">
            <div className="flex justify-between gap-4 flex-wrap">
              <div>
                <strong>{message.name}</strong>{" "}
                <a href={`mailto:${message.email}`}>{message.email}</a>
                <div className="text-sm text-subtle">
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
            <p className="mt-2 mb-0 whitespace-pre-wrap">{message.message}</p>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
