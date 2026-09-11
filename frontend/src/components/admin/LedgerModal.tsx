import Alert from "react-bootstrap/Alert";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import { m } from "@/paraglide/messages";
import type { LedgerTransaction } from "@/types/registration";
import { transactionAmountLabel } from "@/utils/paymentTransactionLabels";

/** Read-only drill-down into the filtered ledger rows behind an edition or
 * person payment summary (#1019) — the same rows as the CSV export, viewed
 * in-app. `showPerson`/`showEvent` hide whichever column is redundant with
 * the modal's own scope (the person view doesn't need a person column; the
 * edition view doesn't need an edition column).
 *
 * The underlying list endpoint is paginated (#1032); `page`/`pageSize` and
 * `onPreviousPage`/`onNextPage` are only rendered as Prev/Next controls when
 * the caller passes them — omit them to keep showing an unpaginated `rows`
 * as before. */
export default function LedgerModal({
  show,
  title,
  rows,
  loading,
  error,
  showPerson = true,
  showEvent = true,
  page,
  pageSize,
  onPreviousPage,
  onNextPage,
  onHide,
}: {
  show: boolean;
  title: string;
  rows: LedgerTransaction[];
  loading: boolean;
  error: boolean;
  showPerson?: boolean;
  showEvent?: boolean;
  page?: number;
  pageSize?: number;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onHide: () => void;
}) {
  const paginated = page !== undefined && pageSize !== undefined;
  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
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
        {!loading && !error && rows.length === 0 && (
          <p className="text-secondary text-center py-4 mb-0">{m.admin_payment_history_empty()}</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <ListGroup variant="flush">
            {rows.map((entry) => (
              <ListGroup.Item key={entry.id} className="bg-dark border-secondary text-light py-2">
                <div className="d-flex justify-content-between flex-wrap gap-2 small">
                  <span>
                    <strong>{transactionAmountLabel(entry.amount)}</strong>{" "}
                    {entry.amount >= 0 ? "+" : ""}€{entry.amount.toFixed(2)}
                    {entry.reference ? ` · ${entry.reference}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </span>
                  <span className="text-secondary">{entry.effectiveDate}</span>
                </div>
                <div className="text-secondary" style={{ fontSize: "0.7rem" }}>
                  {showPerson ? entry.personName : null}
                  {showPerson && showEvent ? " · " : ""}
                  {showEvent ? `${entry.eventTitle} (${entry.editionLabel})` : null}
                  {(showPerson || showEvent) && " · "}
                  {entry.recordedBy}
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-dark border-secondary">
        {paginated && (
          <div className="d-flex align-items-center gap-2 me-auto">
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={loading || page === 1}
              onClick={onPreviousPage}
            >
              {m.admin_ledger_previous_page()}
            </Button>
            <span className="text-secondary small">
              {m.admin_ledger_page_label({ page: page as number })}
            </span>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={loading || rows.length < (pageSize as number)}
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
