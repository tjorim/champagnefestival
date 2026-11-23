import { getLocale } from "@/paraglide/runtime";
import { formatDateTime } from "@/lib/format/dateUtils";
import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, MailDotIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createAppColumnHelper } from "../shared/useAdminTable";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { fetchQueuePage, queueSearchParams, queueStatus } from "../shared/adminQueue";
import type { AdminTableState } from "../shared/adminTableState";
import { queryKeys } from "@/lib/query/queryKeys";
import { AdminDataTable, type AdminTableFilter } from "../shared/AdminDataTable";
import { QueueRowAction } from "../shared/QueueRowAction";

type ContactMessage = import("@/api-types").ContactMessageOut;

const columnHelper = createAppColumnHelper<ContactMessage>();

const contactMessageFilters = (): AdminTableFilter[] => [
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

export default function ContactMessagesManagement() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.contactMessages }),
    [queryClient],
  );

  const useDataSource = useCallback(function useDataSource(state: AdminTableState) {
    const query = queueSearchParams(state);
    const page = useQuery({
      queryKey: queryKeys.admin.contactMessagesPage(query),
      queryFn: ({ signal }) =>
        fetchQueuePage<ContactMessage>(
          "/api/contact",
          query,

          signal,
          m.admin_error_load_contact_messages(),
        ),
      placeholderData: keepPreviousData,
    });
    return { ...page, filters: contactMessageFilters() };
  }, []);

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
        cell: (info) => formatDateTime(info.row.original.created_at, getLocale()),
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
          return message.handled_at ? null : (
            <QueueRowAction
              label={m.admin_contact_message_mark_handled()}
              failure={m.admin_contact_message_mark_failed({ name: message.name })}
              run={() =>
                fetchJsonOrThrow(
                  `/api/contact/${message.id}/handled`,
                  { method: "PUT" },
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
    [refresh],
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
          getRowClassName={(message) => (message.handled_at ? "text-subtle" : undefined)}
          renderCard={(message) => (
            <>
              <Sender message={message} />
              <div className="text-sm text-subtle">
                {formatDateTime(message.created_at, getLocale())}
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
      {!message.handled_at && <Icon icon={MailDotIcon} className="me-2 text-primary" />}
      <strong>{message.name}</strong>
      <div>
        <a href={`mailto:${message.email}`}>{message.email}</a>
      </div>
    </>
  );
}

/** Icon plus text, so a handled message is told apart without relying on colour. */
function Status({ message }: { message: ContactMessage }) {
  return message.handled_at ? (
    <span className="inline-flex items-center gap-1 text-success-text">
      <CheckIcon className="size-4" aria-hidden="true" />
      {m.admin_contact_message_handled()}
    </span>
  ) : (
    <span>{m.admin_contact_message_status_unhandled()}</span>
  );
}
