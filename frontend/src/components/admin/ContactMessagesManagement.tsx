import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, MailDotIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { fetchQueuePage, queueSearchParams, queueStatus } from "@/utils/adminQueue";
import type { AdminTableState } from "@/utils/adminTableState";
import { queryKeys } from "@/utils/queryKeys";
import { AdminDataTable, type AdminTableFilter } from "./AdminDataTable";
import { QueueRowAction } from "./QueueRowAction";

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

const columnHelper = createAppColumnHelper<ContactMessage>();

const filters: AdminTableFilter[] = [
  {
    id: "status",
    label: m.admin_status_label(),
    defaultValue: "unhandled",
    options: [
      { value: "unhandled", label: m.admin_contact_message_status_unhandled() },
      { value: "handled", label: m.admin_contact_message_handled() },
      { value: "all", label: m.admin_filter_all() },
    ],
  },
];

export default function ContactMessagesManagement({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.contactMessages }),
    [queryClient],
  );

  const useDataSource = useCallback(
    function useDataSource(state: AdminTableState) {
      const query = queueSearchParams(state);
      const page = useQuery({
        queryKey: queryKeys.admin.contactMessagesPage(query),
        queryFn: ({ signal }) =>
          fetchQueuePage(
            "/api/contact",
            query,
            authHeaders,
            signal,
            m.admin_error_load_contact_messages(),
            mapMessage,
          ),
        placeholderData: keepPreviousData,
      });
      return { ...page, filters };
    },
    [authHeaders],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "sender",
        header: m.admin_contact_message_col_sender(),
        enableSorting: false,
        cell: (info) => <Sender message={info.row.original} />,
        meta: { tdClassName: "break-words" },
      }),
      columnHelper.display({
        id: "message",
        header: m.admin_contact_message_col_message(),
        enableSorting: false,
        cell: (info) => info.row.original.message,
        meta: { tdClassName: "whitespace-pre-wrap break-words max-w-xl" },
      }),
      columnHelper.display({
        id: "received",
        header: m.admin_contact_message_col_received(),
        enableSorting: false,
        cell: (info) => new Date(info.row.original.createdAt).toLocaleString(),
      }),
      columnHelper.display({
        id: "status",
        header: m.admin_status_label(),
        enableSorting: false,
        cell: (info) => <Status message={info.row.original} />,
      }),
      columnHelper.display({
        id: "actions",
        header: m.admin_actions_label(),
        enableSorting: false,
        cell: (info) => {
          const message = info.row.original;
          return message.handledAt ? null : (
            <QueueRowAction
              label={m.admin_contact_message_mark_handled()}
              failure={m.admin_contact_message_mark_failed({ name: message.name })}
              run={() =>
                fetchJsonOrThrowWithUnauthorized(
                  `/api/contact/${message.id}/handled`,
                  { method: "PUT", headers: authHeaders() },
                  m.admin_error_handle_contact_message(),
                )
              }
              onDone={() => {
                setNotice(m.admin_contact_message_marked({ name: message.name }));
                refresh();
              }}
            />
          );
        },
      }),
    ],
    [authHeaders, refresh],
  );

  return (
    <Card tone="secondary">
      <CardHeader className="font-semibold">{m.admin_contact_messages_section()}</CardHeader>
      <CardContent>
        <p className="text-subtle text-sm">{m.admin_contact_messages_description()}</p>
        <p role="status" className="text-sm">
          {notice}
        </p>
        <AdminDataTable
          id="contact-messages"
          columns={columns}
          useDataSource={useDataSource}
          columnVisibilityKey="admin-col-vis-contact-messages"
          getRowId={(message) => message.id}
          getRowLabel={(message) => message.name}
          getRowClassName={(message) => (message.handledAt ? "text-subtle" : undefined)}
          renderCard={(message) => (
            <>
              <Sender message={message} />
              <div className="text-sm text-subtle">
                {new Date(message.createdAt).toLocaleString()}
              </div>
              <p className="mb-0 whitespace-pre-wrap">{message.message}</p>
              <Status message={message} />
            </>
          )}
          labels={{
            caption: m.admin_contact_messages_table_caption(),
            search: m.admin_contact_messages_search(),
            sort: m.admin_table_sort(),
            clear: m.admin_content_clear_filters(),
            loading: m.admin_loading(),
            empty: (state) =>
              state.search
                ? m.admin_contact_messages_no_match()
                : queueStatus(state) === "unhandled"
                  ? m.admin_contact_messages_empty_unhandled()
                  : queueStatus(state) === "all"
                    ? m.admin_contact_messages_empty()
                    : m.admin_contact_messages_no_match(),
            error: m.admin_error_load_contact_messages(),
            retry: m.admin_retry(),
            open: "",
            actions: m.admin_actions_label(),
            export: "",
            selectAll: "",
            results: (total) => m.admin_table_results({ total }),
          }}
        />
      </CardContent>
    </Card>
  );
}

function Sender({ message }: { message: ContactMessage }) {
  return (
    <>
      {!message.handledAt && <Icon icon={MailDotIcon} className="me-2 text-primary" />}
      <strong>{message.name}</strong>
      <div>
        <a href={`mailto:${message.email}`}>{message.email}</a>
      </div>
    </>
  );
}

/** Icon plus text, so a handled message is told apart without relying on colour. */
function Status({ message }: { message: ContactMessage }) {
  return message.handledAt ? (
    <span className="inline-flex items-center gap-1 text-success-text">
      <CheckIcon className="size-4" aria-hidden="true" />
      {m.admin_contact_message_handled()}
    </span>
  ) : (
    <span>{m.admin_contact_message_status_unhandled()}</span>
  );
}
