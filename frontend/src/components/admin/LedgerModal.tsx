import { useMemo } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { type OnChangeFn, type SortingState } from "@tanstack/react-table";
import { m } from "@/paraglide/messages";
import type { LedgerSortKey } from "@/utils/adminFetch";
import type { LedgerTransaction } from "@/types/registration";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";
import { transactionAmountLabel } from "@/utils/paymentTransactionLabels";

// Maps a sortable table column's id to the backend `sort` query param it
// corresponds to (see backend/app/services/payments_service.py's
// _LEDGER_SORT_COLUMNS). Sorting is server-side — the table only ever holds
// one page of rows — so every sortable column here must have a backend
// counterpart. Exported so both LedgerModal callers (PeopleManagement,
// AnalyticsDashboard) can translate their own `sorting` state into the
// `sort`/`sortDir` params fetchPaymentTransactionsLedger takes, without
// redefining the column-id-to-backend-key mapping only this module owns.
export const LEDGER_SORT_KEY_BY_COLUMN: Record<string, LedgerSortKey> = {
  effectiveDate: "effective_date",
  amount: "amount",
};

const columnHelper = createAppColumnHelper<LedgerTransaction>();

/** Read-only drill-down into the filtered ledger rows behind an edition or
 * person payment summary (#1019) — the same rows as the CSV export, viewed
 * in-app. `showPerson`/`showEvent` hide whichever column is redundant with
 * the modal's own scope (the person view doesn't need a person column; the
 * edition view doesn't need an edition column).
 *
 * Server-paginated and sortable (#1032), mirroring RegistrationList.tsx:
 * `total` backs the Prev/Next controls and an admin can click "Effective
 * Date" or "Amount" to flip the order instead of being stuck with a single
 * hardcoded one. */
export default function LedgerModal({
  show,
  title,
  page,
  transactions,
  total,
  limit,
  sorting,
  onSortingChange,
  loading,
  isFetching,
  error,
  showPerson = true,
  showEvent = true,
  onPreviousPage,
  onNextPage,
  onHide,
}: {
  show: boolean;
  title: string;
  page: number;
  transactions: LedgerTransaction[];
  total: number;
  limit: number;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  loading: boolean;
  isFetching: boolean;
  error: boolean;
  showPerson?: boolean;
  showEvent?: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onHide: () => void;
}) {
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("effectiveDate", {
          header: m.admin_payment_transaction_date(),
        }),
        columnHelper.accessor("amount", {
          header: m.admin_payment_amount_label(),
          cell: ({ getValue }) => {
            const amount = getValue();
            return (
              <>
                <strong>{transactionAmountLabel(amount)}</strong> {amount >= 0 ? "+" : ""}€
                {amount.toFixed(2)}
              </>
            );
          },
        }),
        columnHelper.display({
          id: "reference",
          header: m.admin_payment_reference_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const entry = row.original;
            return (
              <>
                {entry.reference}
                {entry.reference && entry.note ? " · " : ""}
                {entry.note}
              </>
            );
          },
        }),
        columnHelper.accessor("personName", {
          header: m.admin_person_label(),
          enableSorting: false,
        }),
        columnHelper.display({
          id: "event",
          header: m.admin_event_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const entry = row.original;
            return `${entry.eventTitle} (${entry.editionLabel})`;
          },
        }),
        columnHelper.accessor("recordedBy", {
          header: m.admin_ledger_column_recorded_by(),
          enableSorting: false,
        }),
      ]),
    [],
  );

  // Both columns stay defined (rather than conditionally built into
  // `columns`, which TanStack Table's generics can't type as a uniform
  // array) and are just hidden via column visibility when redundant with
  // the modal's own scope — the person view doesn't need a person column;
  // the edition view doesn't need an event/edition column.
  const columnVisibility = useMemo(
    () => ({ personName: showPerson, event: showEvent }),
    [showPerson, showEvent],
  );

  const table = useAppTable(
    {
      data: transactions,
      columns,
      state: { sorting, columnVisibility },
      getRowId: (row) => row.id,
      onSortingChange,
    },
    (state) => ({ sorting: state.sorting, columnVisibility: state.columnVisibility }),
  );

  const rangeFrom = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeTo = Math.min(page * limit, total);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          <i className="bi bi-journal-text me-2" aria-hidden="true" />
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light p-0">
        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" variant="warning" />
          </div>
        )}
        {!loading && error && (
          <Alert role="alert" aria-live="assertive" variant="danger" className="m-3">
            {m.admin_payment_history_error()}
          </Alert>
        )}
        {!loading && !error && total === 0 && (
          <p className="text-secondary text-center py-4 mb-0">{m.admin_payment_history_empty()}</p>
        )}
        {!loading && !error && total > 0 && (
          <div className="table-responsive">
            <Table variant="dark" hover striped className="mb-0" size="sm">
              <caption className="visually-hidden">{m.admin_ledger_table_caption()}</caption>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={
                            canSort
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    header.column.getToggleSortingHandler()?.(e);
                                  }
                                }
                              : undefined
                          }
                          tabIndex={canSort ? 0 : undefined}
                          aria-sort={
                            canSort
                              ? sorted === "asc"
                                ? "ascending"
                                : sorted === "desc"
                                  ? "descending"
                                  : "none"
                              : undefined
                          }
                          style={{ cursor: canSort ? "pointer" : "default", whiteSpace: "nowrap" }}
                        >
                          <table.FlexRender header={header} />
                          {canSort && (
                            <i
                              className={`bi ms-1 small ${
                                sorted === "asc"
                                  ? "bi-arrow-up"
                                  : sorted === "desc"
                                    ? "bi-arrow-down"
                                    : "bi-arrow-down-up opacity-25"
                              }`}
                              aria-hidden="true"
                            />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="small">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-dark border-secondary">
        {total > 0 && (
          <div className="d-flex align-items-center gap-2 me-auto">
            <span className="text-secondary small">
              {m.admin_ledger_page_summary({ from: rangeFrom, to: rangeTo, total })}
            </span>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={isFetching || page <= 1}
              onClick={onPreviousPage}
            >
              {m.admin_ledger_previous_page()}
            </Button>
            <span className="text-secondary small">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={isFetching || page >= totalPages}
              onClick={onNextPage}
            >
              {m.admin_ledger_next_page()}
            </Button>
          </div>
        )}
        <Button variant="outline-secondary" size="sm" onClick={onHide}>
          {m.close()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
