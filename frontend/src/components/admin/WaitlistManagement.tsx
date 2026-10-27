import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ConfirmModal from "@/components/ConfirmModal";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import { m } from "@/paraglide/messages";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { ApiError } from "@/utils/apiErrors";
import {
  fetchQueuePage,
  queueSearchParams,
  queueStatus,
  type QueueStatus,
} from "@/utils/adminQueue";
import type { AdminTableState } from "@/utils/adminTableState";
import { queryKeys } from "@/utils/queryKeys";
import { AdminDataTable, type AdminTableFilter } from "./AdminDataTable";
import { QueueRowAction } from "./QueueRowAction";

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

interface WaitlistScope {
  id: string;
  label: string;
  eventId: string;
  outstanding: number;
  total: number;
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

const columnHelper = createAppColumnHelper<WaitlistEntry>();

/** The count beside a filter option follows the queue view, so it agrees with the rows it selects. */
const scopeCount = (scope: WaitlistScope, status: QueueStatus) =>
  status === "unhandled"
    ? scope.outstanding
    : status === "handled"
      ? scope.total - scope.outstanding
      : scope.total;

function useWaitlistScopes(authHeaders: () => Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.admin.waitlistScopes,
    queryFn: async ({ signal }) => {
      const body = await fetchJsonOrThrowWithUnauthorized<{
        events: { id: string; title: string; outstanding: number; total: number }[];
        products: {
          id: string;
          name: string;
          event_id: string;
          event_title: string;
          outstanding: number;
          total: number;
        }[];
      }>("/api/waitlist/scopes", { headers: authHeaders(), signal }, m.admin_error_load_waitlist());
      return {
        events: body.events.map((event): WaitlistScope => ({
          id: event.id,
          label: event.title,
          eventId: event.id,
          outstanding: event.outstanding,
          total: event.total,
        })),
        products: body.products.map((product): WaitlistScope => ({
          id: product.id,
          label: product.name,
          eventId: product.event_id,
          outstanding: product.outstanding,
          total: product.total,
        })),
      };
    },
  });
}

export default function WaitlistManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<WaitlistEntry | null>(null);
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.waitlistEntries }),
    [queryClient],
  );

  const useDataSource = useCallback(
    function useDataSource(state: AdminTableState) {
      const status = queueStatus(state);
      const query = queueSearchParams(state, {
        event_id: state.filters.event,
        product_id: state.filters.product,
      });
      const page = useQuery({
        queryKey: queryKeys.admin.waitlistEntriesPage(query),
        queryFn: ({ signal }) =>
          fetchQueuePage(
            "/api/waitlist",
            query,
            authHeaders,
            signal,
            m.admin_error_load_waitlist(),
            mapEntry,
          ),
        placeholderData: keepPreviousData,
      });
      const scopes = useWaitlistScopes(authHeaders);
      const filters: AdminTableFilter[] = [
        {
          id: "status",
          label: m.admin_status_label(),
          defaultValue: "unhandled",
          options: [
            { value: "unhandled", label: m.admin_waitlist_status_unhandled() },
            { value: "handled", label: m.admin_waitlist_handled() },
            { value: "all", label: m.admin_filter_all() },
          ],
        },
        {
          id: "event",
          label: m.admin_waitlist_filter_event(),
          options: (scopes.data?.events ?? []).map((scope) => ({
            value: scope.id,
            label: `${scope.label} (${scopeCount(scope, status)})`,
          })),
        },
        {
          id: "product",
          label: m.admin_waitlist_filter_product(),
          options: (scopes.data?.products ?? [])
            .filter(
              (scope) =>
                !state.filters.event ||
                scope.eventId === state.filters.event ||
                scope.id === state.filters.product,
            )
            .map((scope) => ({
              value: scope.id,
              label: `${scope.label} (${scopeCount(scope, status)})`,
            })),
        },
      ];
      return { ...page, filters };
    },
    [authHeaders],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "person",
        header: m.admin_waitlist_col_person(),
        enableSorting: false,
        cell: (info) => <Person entry={info.row.original} />,
        meta: { tdClassName: "break-words" },
      }),
      columnHelper.display({
        id: "item",
        header: m.admin_waitlist_col_item(),
        enableSorting: false,
        cell: (info) => (
          <>
            <strong>{info.row.original.productName}</strong>
            <div className="text-sm text-subtle">{info.row.original.eventTitle}</div>
          </>
        ),
        meta: { tdClassName: "break-words" },
      }),
      columnHelper.display({
        id: "guests",
        header: m.admin_waitlist_col_guests(),
        enableSorting: false,
        cell: (info) => info.row.original.guestCount,
      }),
      columnHelper.display({
        id: "requested",
        header: m.admin_waitlist_col_requested(),
        enableSorting: false,
        cell: (info) => new Date(info.row.original.createdAt).toLocaleString(),
      }),
      columnHelper.display({
        id: "notes",
        header: m.admin_waitlist_col_notes(),
        enableSorting: false,
        cell: (info) => info.row.original.notes || "—",
        meta: { tdClassName: "whitespace-pre-wrap break-words max-w-72" },
      }),
      columnHelper.display({
        id: "status",
        header: m.admin_status_label(),
        enableSorting: false,
        cell: (info) => <Status entry={info.row.original} />,
      }),
      columnHelper.display({
        id: "actions",
        header: m.admin_actions_label(),
        enableSorting: false,
        cell: (info) => {
          const entry = info.row.original;
          return (
            <div className="flex flex-wrap items-start gap-2">
              {!entry.handledAt && (
                <QueueRowAction
                  label={m.admin_waitlist_mark_handled()}
                  failure={m.admin_waitlist_mark_failed({ name: entry.name })}
                  run={() =>
                    fetchJsonOrThrowWithUnauthorized(
                      `/api/waitlist/${entry.id}/handled`,
                      { method: "PUT", headers: authHeaders() },
                      m.admin_error_handle_waitlist_entry(),
                    )
                  }
                  onDone={() => {
                    setNotice(m.admin_waitlist_marked({ name: entry.name }));
                    refresh();
                  }}
                />
              )}
              <Button size="sm" variant="outline-danger" onClick={() => setDeleting(entry)}>
                {m.admin_delete()}
              </Button>
            </div>
          );
        },
      }),
    ],
    [authHeaders, refresh],
  );

  return (
    <Card tone="secondary">
      <CardHeader className="font-semibold">{m.admin_waitlist_section()}</CardHeader>
      <CardContent>
        <p className="text-subtle text-sm">{m.admin_waitlist_description()}</p>
        <p role="status" className="text-sm">
          {notice}
        </p>
        <AdminDataTable
          id="waitlist"
          columns={columns}
          useDataSource={useDataSource}
          columnVisibilityKey="admin-col-vis-waitlist"
          getRowId={(entry) => entry.id}
          getRowLabel={(entry) => entry.name}
          getRowClassName={(entry) => (entry.handledAt ? "text-subtle" : undefined)}
          renderCard={(entry) => (
            <>
              <Person entry={entry} />
              <div>
                <strong>{entry.productName}</strong> · {entry.eventTitle}
              </div>
              <div className="text-sm text-subtle">
                {m.admin_waitlist_guest_count({ count: entry.guestCount })} ·{" "}
                {new Date(entry.createdAt).toLocaleString()}
              </div>
              {entry.notes && <p className="mb-0 text-sm whitespace-pre-wrap">{entry.notes}</p>}
              <Status entry={entry} />
            </>
          )}
          labels={{
            caption: m.admin_waitlist_table_caption(),
            search: m.admin_waitlist_search(),
            sort: m.admin_table_sort(),
            clear: m.admin_content_clear_filters(),
            loading: m.admin_loading(),
            empty: (state) =>
              state.search || state.filters.event || state.filters.product
                ? m.admin_waitlist_no_match()
                : queueStatus(state) === "unhandled"
                  ? m.admin_waitlist_empty_unhandled()
                  : queueStatus(state) === "all"
                    ? m.admin_waitlist_empty()
                    : m.admin_waitlist_no_match(),
            error: m.admin_error_load_waitlist(),
            retry: m.admin_retry(),
            open: "",
            actions: m.admin_actions_label(),
            export: "",
            selectAll: "",
            results: (total) => m.admin_table_results({ total }),
          }}
        />
        {deleting && (
          <ConfirmModal
            admin
            show
            title={m.admin_waitlist_delete_title()}
            body={m.admin_waitlist_delete_body({
              name: deleting.name,
              email: deleting.email,
              product: deleting.productName,
              event: deleting.eventTitle,
            })}
            confirmLabel={m.admin_delete()}
            errorFallback={m.admin_error_delete_waitlist_entry()}
            onHide={() => setDeleting(null)}
            onConfirm={async () => {
              try {
                await fetchVoidOrThrowWithUnauthorized(
                  `/api/waitlist/${deleting.id}`,
                  { method: "DELETE", headers: authHeaders() },
                  m.admin_error_delete_waitlist_entry(),
                );
              } catch (error) {
                // Already gone is the state the delete was after: a retry converges instead of failing.
                if (!(error instanceof ApiError && error.status === 404)) throw error;
              }
              setNotice(m.admin_waitlist_deleted({ name: deleting.name }));
              refresh();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Person({ entry }: { entry: WaitlistEntry }) {
  return (
    <>
      <strong>{entry.name}</strong>
      <div>
        <a href={`mailto:${entry.email}`}>{entry.email}</a>
        {entry.phone && <> · {entry.phone}</>}
      </div>
    </>
  );
}

/** Icon plus text, so a contacted entry is told apart without relying on colour. */
function Status({ entry }: { entry: WaitlistEntry }) {
  return entry.handledAt ? (
    <span className="inline-flex items-center gap-1 text-success-text">
      <CheckIcon className="size-4" aria-hidden="true" />
      {m.admin_waitlist_handled()}
    </span>
  ) : (
    <span>{m.admin_waitlist_status_unhandled()}</span>
  );
}
