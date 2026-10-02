import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import {
  fetchArrayOrThrow,
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";

interface WaitlistEntry {
  id: string;
  productId: string;
  productName: string;
  eventId: string;
  eventTitle: string;
  name: string;
  email: string;
  phone: string | null;
  guestCount: number;
  notes: string;
  createdAt: string;
  handledAt: string | null;
}

const mapEntry = (item: Record<string, unknown>): WaitlistEntry => ({
  id: String(item.id),
  productId: String(item.product_id),
  productName: String(item.product_name),
  eventId: String(item.event_id),
  eventTitle: String(item.event_title),
  name: String(item.name),
  email: String(item.email),
  phone: item.phone == null ? null : String(item.phone),
  guestCount: Number(item.guest_count ?? 1),
  notes: String(item.notes ?? ""),
  createdAt: String(item.created_at),
  handledAt: item.handled_at == null ? null : String(item.handled_at),
});

export default function WaitlistManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const entries = useQuery({
    queryKey: queryKeys.admin.waitlistEntries,
    queryFn: () =>
      fetchArrayOrThrow(
        "/api/waitlist",
        { headers: authHeaders() },
        m.admin_error_load_waitlist(),
        mapEntry,
      ),
  });
  const handled = useMutation({
    mutationFn: (id: string) =>
      fetchJsonOrThrowWithUnauthorized<WaitlistEntry>(
        `/api/waitlist/${id}/handled`,
        { method: "PUT", headers: authHeaders() },
        m.admin_error_handle_waitlist_entry(),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.waitlistEntries }),
    retry: false,
  });
  const removed = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/waitlist/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_handle_waitlist_entry(),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.waitlistEntries }),
    retry: false,
  });

  return (
    <Card tone="secondary">
      <CardHeader className="font-semibold">{m.admin_waitlist_section()}</CardHeader>
      <CardContent>
        <p className="text-subtle text-sm">{m.admin_waitlist_description()}</p>
        {entries.isPending && <Spinner label={m.admin_loading()} size="sm" />}
        {entries.isError && <Alert variant="danger">{m.admin_error_load_waitlist()}</Alert>}
        {(handled.isError || removed.isError) && (
          <Alert variant="danger">{m.admin_error_handle_waitlist_entry()}</Alert>
        )}
        {entries.data?.length === 0 && (
          <p className="text-subtle mb-0">{m.admin_waitlist_empty()}</p>
        )}
        {entries.data?.map((entry) => (
          <article key={entry.id} className="border-b border-subtle pb-4 mb-4">
            <div className="flex justify-between gap-4 flex-wrap">
              <div>
                <Badge variant="secondary" className="me-2">
                  {entry.eventTitle} — {entry.productName}
                </Badge>
                <div>
                  <strong>{entry.name}</strong> <a href={`mailto:${entry.email}`}>{entry.email}</a>
                  {entry.phone && <> · {entry.phone}</>}
                </div>
                <div className="text-sm text-subtle">
                  {m.admin_waitlist_guest_count({ count: entry.guestCount })} ·{" "}
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-start gap-2">
                {entry.handledAt ? (
                  <span className="text-success">{m.admin_waitlist_handled()}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => handled.mutate(entry.id)}
                  >
                    {m.admin_waitlist_mark_handled()}
                  </Button>
                )}
                <Button size="sm" variant="outline-danger" onClick={() => removed.mutate(entry.id)}>
                  {m.admin_delete()}
                </Button>
              </div>
            </div>
            {entry.notes && <p className="mt-2 mb-0 text-sm whitespace-pre-wrap">{entry.notes}</p>}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
