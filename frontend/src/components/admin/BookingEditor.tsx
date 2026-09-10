import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import type { FloorTable } from "@/types/admin";
import type { Product } from "@/types/event";
import type {
  BookingUpdate,
  PaymentTransactionCreate,
  PaymentTransactionKind,
  Registration,
  RegistrationStatus,
  TableAllocation,
} from "@/types/registration";
import { fetchPaymentTransactions } from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";
import { m } from "@/paraglide/messages";

function transactionKindLabel(kind: PaymentTransactionKind): string {
  switch (kind) {
    case "refund":
      return m.admin_payment_reason_refund();
    case "correction":
      return m.admin_payment_reason_correction();
    default:
      return m.admin_payment_reason_payment();
  }
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BookingEditor({
  registration,
  registrations = [],
  authHeaders,
  tables,
  onSave,
  onAddTransaction,
}: {
  registration: Registration;
  registrations?: Registration[];
  authHeaders: () => Record<string, string>;
  tables: FloorTable[];
  onSave: (id: string, update: BookingUpdate) => Promise<void>;
  onAddTransaction?: (
    registrationId: string,
    payload: PaymentTransactionCreate,
  ) => Promise<unknown>;
}) {
  const tableOccupancy = useMemo(() => {
    const occupied = new Map<string, number>();
    for (const r of registrations) {
      if (r.status === "cancelled" || r.id === registration.id) continue;
      for (const allocation of r.allocations ?? []) {
        occupied.set(
          allocation.tableId,
          (occupied.get(allocation.tableId) ?? 0) + allocation.guestCount,
        );
      }
    }
    return occupied;
  }, [registrations, registration.id]);
  const purchased = useMemo(
    () =>
      Object.fromEntries(
        registration.orderItems.map((item) => [
          item.productId,
          item.quantity - item.includedQuantity,
        ]),
      ),
    [registration],
  );
  const products = useMemo<Product[]>(() => {
    const current = registration.event?.products ?? [];
    const missing = registration.orderItems
      .filter((item) => !current.some((product) => product.id === item.productId))
      .map((item) => ({
        id: item.productId,
        eventId: registration.eventId,
        name: item.name,
        description: "",
        price: item.price,
        category: item.category,
        active: false,
        required: false,
        createdAt: "",
        updatedAt: "",
      }));
    return [...current, ...missing];
  }, [registration]);
  const bookedPrices = useMemo(
    () => Object.fromEntries(registration.orderItems.map((item) => [item.productId, item.price])),
    [registration],
  );
  const [guestCount, setGuestCount] = useState(registration.guestCount);
  const [quantities, setQuantities] = useState<Record<string, number>>(purchased);
  const [allocations, setAllocations] = useState<TableAllocation[]>(registration.allocations ?? []);
  const [notes, setNotes] = useState(registration.notes);
  const [status, setStatus] = useState(registration.status);
  const [pending, setPending] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  const [transactionKind, setTransactionKind] = useState<PaymentTransactionKind>("payment");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayDateInputValue());
  const [transactionReference, setTransactionReference] = useState("");
  const [transactionNote, setTransactionNote] = useState("");
  const [transactionReversedId, setTransactionReversedId] = useState("");
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionError, setTransactionError] = useState("");

  const ledgerQuery = useQuery({
    queryKey: queryKeys.admin.paymentTransactions(registration.id),
    queryFn: () => fetchPaymentTransactions(authHeaders, registration.id),
    enabled: showLedger,
  });

  const amountDue = products.length
    ? products.reduce(
        (sum, product) =>
          sum + (quantities[product.id] ?? 0) * (bookedPrices[product.id] ?? product.price),
        0,
      )
    : (registration.amountDue ?? 0);
  const amountPaid = registration.amountPaid ?? 0;
  const calculatedTableQuantity = products.reduce(
    (sum, product) => (product.unit === "table" ? sum + (quantities[product.id] ?? 0) : sum),
    0,
  );
  const tableQuantity = products.some((product) => product.unit === "table")
    ? calculatedTableQuantity
    : (registration.bookedTableQuantity ?? 0);
  const assigned = tableQuantity
    ? allocations.length
    : allocations.reduce((sum, item) => sum + item.guestCount, 0);
  const allocationTotal = tableQuantity || guestCount;
  const invalidAllocation = allocations.some(
    (item) =>
      !item.tableId ||
      !Number.isInteger(item.guestCount) ||
      (tableQuantity === 0 && item.guestCount < 1),
  );

  const changeAllocation = (index: number, patch: Partial<TableAllocation>) =>
    setAllocations((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const allocationShortage = status !== "cancelled" && assigned > allocationTotal;
  const tableReleaseCount = allocations.length - tableQuantity;
  const invalidQuantity = Object.values(quantities).some(
    (quantity) => !Number.isInteger(quantity) || quantity < 0 || quantity > 1000,
  );
  const setProductQuantity = (productId: string, quantity: number) => {
    const next = { ...quantities, [productId]: quantity };
    const nextTableQuantity = products.reduce(
      (sum, product) => (product.unit === "table" ? sum + (next[product.id] ?? 0) : sum),
      0,
    );
    if (Boolean(nextTableQuantity) !== Boolean(tableQuantity)) {
      setAllocations((items) =>
        items.map((item) => ({
          ...item,
          exclusive: nextTableQuantity > 0,
          guestCount: nextTableQuantity > 0 ? 0 : Math.max(1, item.guestCount),
        })),
      );
    }
    setQuantities(next);
  };

  const parsedTransactionAmount = Number(transactionAmount);
  const transactionAmountInvalid =
    transactionAmount.trim() === "" || !Number.isFinite(parsedTransactionAmount);
  const signedTransactionAmount =
    transactionKind === "refund"
      ? -Math.abs(parsedTransactionAmount)
      : Math.abs(parsedTransactionAmount);

  return (
    <section aria-labelledby="booking-editor-heading">
      <h6 id="booking-editor-heading" className="text-warning">
        {m.admin_booking_editor()}
      </h6>
      <div className="row g-3">
        <Form.Group className="col-sm-4">
          <Form.Label>{m.admin_guests_count()}</Form.Label>
          <Form.Control
            aria-label={m.admin_guests_count()}
            type="number"
            min={1}
            max={20}
            value={guestCount}
            onChange={(event) => setGuestCount(Number(event.target.value))}
          />
        </Form.Group>
        <Form.Group className="col-sm-4">
          <Form.Label>{m.admin_status_label()}</Form.Label>
          <Form.Select
            aria-label={m.admin_status_label()}
            value={status}
            onChange={(event) => setStatus(event.target.value as RegistrationStatus)}
          >
            <option value="pending">{m.admin_status_pending()}</option>
            <option value="confirmed">{m.admin_status_confirmed()}</option>
            <option value="cancelled">{m.admin_status_cancelled()}</option>
          </Form.Select>
        </Form.Group>
        <div className="col-sm-4 small align-self-end">
          <div>
            {m.admin_booking_total()}: €{amountDue.toFixed(2)}
          </div>
          <div>
            {m.admin_inventory_paid()}: €{amountPaid.toFixed(2)}
          </div>
          <div>
            {m.admin_inventory_refund()}: €{Math.max(0, amountPaid - amountDue).toFixed(2)}
          </div>
          {amountPaid < amountDue && (
            <div>
              {m.admin_booking_balance()}: €{(amountDue - amountPaid).toFixed(2)}
            </div>
          )}
        </div>
        {products.map((product) => (
          <Form.Group className="col-sm-6" key={product.id}>
            <Form.Label>
              {product.name} · €{(bookedPrices[product.id] ?? product.price).toFixed(2)}
            </Form.Label>
            <Form.Control
              aria-label={`${m.admin_booking_quantity()} ${product.name}`}
              type="number"
              min={0}
              max={1000}
              disabled={!product.active && !(product.id in purchased)}
              value={quantities[product.id] ?? 0}
              onChange={(event) => setProductQuantity(product.id, Number(event.target.value))}
            />
          </Form.Group>
        ))}
        <Form.Group className="col-12">
          <Form.Label>{m.admin_notes()}</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Form.Group>
      </div>

      <fieldset className="mt-3">
        <legend className="fs-6">{m.admin_action_assign_table()}</legend>
        <p className="small">
          {m.admin_allocation_progress({
            assigned,
            total: allocationTotal,
            unit: tableQuantity ? m.admin_inventory_unit_table() : m.admin_inventory_unit_person(),
          })}
        </p>
        {allocationShortage && tableQuantity > 0 && (
          <Alert variant="warning">
            {m.admin_booking_release_tables({ count: tableReleaseCount })}
          </Alert>
        )}
        {allocations.map((entry, index) => (
          <div key={`${entry.tableId}:${index}`} className="d-flex gap-2 mb-2 align-items-center">
            <Form.Select
              aria-label={m.admin_inventory_unit_table()}
              value={entry.tableId}
              onChange={(event) => changeAllocation(index, { tableId: event.target.value })}
            >
              <option value="">{m.admin_unassigned()}</option>
              {tables
                .filter(
                  (table) =>
                    table.id === entry.tableId ||
                    !allocations.some((item) => item.tableId === table.id),
                )
                .map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} (
                    {m.admin_table_capacity_remaining({
                      count: Math.max(0, table.capacity - (tableOccupancy.get(table.id) ?? 0)),
                    })}
                    )
                  </option>
                ))}
            </Form.Select>
            <Form.Control
              type="number"
              min={tableQuantity ? 0 : 1}
              max={20}
              aria-label={m.admin_guests_count()}
              value={entry.guestCount}
              onChange={(event) =>
                changeAllocation(index, { guestCount: Number(event.target.value) })
              }
              style={{ maxWidth: "6rem" }}
            />
            <Button
              variant="outline-danger"
              onClick={() => setAllocations((items) => items.filter((_, i) => i !== index))}
            >
              {m.admin_inventory_remove()}
            </Button>
          </div>
        ))}
        <Button
          variant="outline-secondary"
          className="me-2"
          disabled={assigned >= allocationTotal}
          onClick={() =>
            setAllocations((items) => [
              ...items,
              { tableId: "", guestCount: tableQuantity ? 0 : 1, exclusive: tableQuantity > 0 },
            ])
          }
        >
          {m.admin_allocation_add()}
        </Button>
        <Button
          disabled={
            pending ||
            invalidAllocation ||
            allocationShortage ||
            invalidQuantity ||
            !Number.isInteger(guestCount) ||
            guestCount < 1 ||
            guestCount > 20
          }
          onClick={async () => {
            setPending(true);
            try {
              await onSave(registration.id, {
                guestCount,
                quantities,
                allocations,
                notes,
                status,
              });
            } finally {
              setPending(false);
            }
          }}
        >
          {m.admin_booking_save_all()}
        </Button>
      </fieldset>

      <fieldset className="mt-3">
        <Button variant="link" size="sm" className="px-0" onClick={() => setShowLedger((v) => !v)}>
          {showLedger ? m.admin_payment_history_hide() : m.admin_payment_history_show()}
        </Button>
        {showLedger && (
          <>
            {ledgerQuery.isLoading && <p className="small">{m.loading()}</p>}
            {ledgerQuery.isError && (
              <Alert variant="danger" className="mb-2">
                {m.admin_payment_history_error()}
              </Alert>
            )}
            {ledgerQuery.data && ledgerQuery.data.length === 0 && (
              <p className="small text-secondary">{m.admin_payment_history_empty()}</p>
            )}
            {ledgerQuery.data && ledgerQuery.data.length > 0 && (
              <ListGroup variant="flush" className="mb-3">
                {ledgerQuery.data.map((entry) => (
                  <ListGroup.Item key={entry.id} className="px-0 py-1">
                    <div className="small d-flex justify-content-between flex-wrap gap-2">
                      <span>
                        <strong>{transactionKindLabel(entry.kind)}</strong>{" "}
                        {entry.amount >= 0 ? "+" : ""}€{entry.amount.toFixed(2)}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                      <span className="text-secondary">
                        {entry.effectiveDate} · {entry.recordedBy}
                      </span>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
            {onAddTransaction && (
              <div className="d-flex flex-wrap gap-2 align-items-end">
                <Form.Group>
                  <Form.Label className="small mb-1">{m.admin_payment_reason_label()}</Form.Label>
                  <Form.Select
                    size="sm"
                    aria-label={m.admin_payment_reason_label()}
                    value={transactionKind}
                    onChange={(event) => {
                      const kind = event.target.value as PaymentTransactionKind;
                      setTransactionKind(kind);
                      if (kind === "payment") setTransactionReversedId("");
                    }}
                  >
                    <option value="payment">{m.admin_payment_reason_payment()}</option>
                    <option value="refund">{m.admin_payment_reason_refund()}</option>
                    <option value="correction">{m.admin_payment_reason_correction()}</option>
                  </Form.Select>
                </Form.Group>
                <Form.Group>
                  <Form.Label className="small mb-1">{m.admin_payment_amount_label()}</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={0}
                    step="0.01"
                    style={{ maxWidth: "8rem" }}
                    aria-label={m.admin_payment_amount_label()}
                    value={transactionAmount}
                    onChange={(event) => setTransactionAmount(event.target.value)}
                  />
                </Form.Group>
                {transactionKind !== "payment" && (
                  <Form.Group>
                    <Form.Label className="small mb-1">
                      {m.admin_payment_reversal_label()}
                    </Form.Label>
                    <Form.Select
                      size="sm"
                      style={{ maxWidth: "12rem" }}
                      aria-label={m.admin_payment_reversal_label()}
                      value={transactionReversedId}
                      onChange={(event) => setTransactionReversedId(event.target.value)}
                    >
                      <option value="">{m.admin_payment_reversal_none()}</option>
                      {(ledgerQuery.data ?? []).map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {transactionKindLabel(entry.kind)} {entry.amount >= 0 ? "+" : ""}€
                          {entry.amount.toFixed(2)} · {entry.effectiveDate}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                )}
                <Form.Group>
                  <Form.Label className="small mb-1">
                    {m.admin_payment_transaction_date()}
                  </Form.Label>
                  <Form.Control
                    size="sm"
                    type="date"
                    aria-label={m.admin_payment_transaction_date()}
                    value={transactionDate}
                    onChange={(event) => setTransactionDate(event.target.value)}
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label className="small mb-1">
                    {m.admin_payment_reference_label()}
                  </Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    style={{ maxWidth: "10rem" }}
                    aria-label={m.admin_payment_reference_label()}
                    value={transactionReference}
                    onChange={(event) => setTransactionReference(event.target.value)}
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label className="small mb-1">{m.admin_payment_note_label()}</Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    style={{ maxWidth: "12rem" }}
                    aria-label={m.admin_payment_note_label()}
                    value={transactionNote}
                    onChange={(event) => setTransactionNote(event.target.value)}
                  />
                </Form.Group>
                <Button
                  size="sm"
                  disabled={
                    transactionPending || transactionAmountInvalid || signedTransactionAmount === 0
                  }
                  onClick={async () => {
                    setTransactionPending(true);
                    setTransactionError("");
                    try {
                      await onAddTransaction(registration.id, {
                        kind: transactionKind,
                        amount: signedTransactionAmount,
                        effectiveDate: transactionDate,
                        reference: transactionReference.trim() || undefined,
                        note: transactionNote.trim() || undefined,
                        reversedTransactionId: transactionReversedId || undefined,
                        idempotencyKey: crypto.randomUUID(),
                      });
                      setTransactionAmount("");
                      setTransactionReference("");
                      setTransactionNote("");
                      setTransactionReversedId("");
                    } catch (err) {
                      setTransactionError(
                        err instanceof Error ? err.message : m.admin_error_record_payment(),
                      );
                    } finally {
                      setTransactionPending(false);
                    }
                  }}
                >
                  {m.admin_payment_record()}
                </Button>
              </div>
            )}
            {transactionError && (
              <Alert variant="danger" className="mt-2 mb-0">
                {transactionError}
              </Alert>
            )}
          </>
        )}
      </fieldset>
    </section>
  );
}
