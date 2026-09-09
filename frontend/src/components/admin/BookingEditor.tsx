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
  Registration,
  RegistrationStatus,
  TableAllocation,
} from "@/types/registration";
import { fetchAuditEntries } from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";
import { m } from "@/paraglide/messages";

type PaymentReason = "payment" | "refund" | "correction";

function paymentReasonLabel(reason: unknown): string {
  switch (reason) {
    case "refund":
      return m.admin_payment_reason_refund();
    case "correction":
      return m.admin_payment_reason_correction();
    default:
      return m.admin_payment_reason_payment();
  }
}

export default function BookingEditor({
  registration,
  authHeaders,
  tables,
  onSave,
}: {
  registration: Registration;
  authHeaders: () => Record<string, string>;
  tables: FloorTable[];
  onSave: (id: string, update: BookingUpdate) => Promise<void>;
}) {
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
  const [amountPaid, setAmountPaid] = useState(registration.amountPaid ?? 0);
  const [paymentReason, setPaymentReason] = useState<PaymentReason>("payment");
  const [paymentTransactionDate, setPaymentTransactionDate] = useState("");
  const [notes, setNotes] = useState(registration.notes);
  const [status, setStatus] = useState(registration.status);
  const [pending, setPending] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const amountPaidChanged = amountPaid !== (registration.amountPaid ?? 0);

  const paymentHistoryQuery = useQuery({
    queryKey: queryKeys.admin.auditEntries({
      resourceType: "registration",
      resourceId: registration.id,
      actor: "",
      action: "amount_paid_updated",
      since: "",
      until: "",
      page: 1,
    }),
    queryFn: () =>
      fetchAuditEntries(authHeaders, {
        resourceType: "registration",
        resourceId: registration.id,
        action: "amount_paid_updated",
        limit: 20,
      }),
    enabled: showPaymentHistory,
  });
  const amountDue = products.length
    ? products.reduce(
        (sum, product) =>
          sum + (quantities[product.id] ?? 0) * (bookedPrices[product.id] ?? product.price),
        0,
      )
    : (registration.amountDue ?? 0);
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
        <Form.Group className="col-sm-4">
          <Form.Label>{m.admin_inventory_paid()}</Form.Label>
          <Form.Control
            aria-label={m.admin_inventory_paid()}
            type="number"
            min={0}
            step="0.01"
            value={amountPaid}
            onChange={(event) => setAmountPaid(Number(event.target.value))}
          />
          {amountPaidChanged && (
            <div className="d-flex gap-2 mt-2">
              <Form.Select
                size="sm"
                aria-label={m.admin_payment_reason_label()}
                value={paymentReason}
                onChange={(event) => setPaymentReason(event.target.value as PaymentReason)}
              >
                <option value="payment">{m.admin_payment_reason_payment()}</option>
                <option value="refund">{m.admin_payment_reason_refund()}</option>
                <option value="correction">{m.admin_payment_reason_correction()}</option>
              </Form.Select>
              <Form.Control
                size="sm"
                type="date"
                aria-label={m.admin_payment_transaction_date()}
                value={paymentTransactionDate}
                onChange={(event) => setPaymentTransactionDate(event.target.value)}
              />
            </div>
          )}
          {amountPaidChanged && <Form.Text>{m.admin_payment_transaction_date_help()}</Form.Text>}
        </Form.Group>
        <div className="col-sm-4 small align-self-end">
          <div>
            {m.admin_booking_total()}: €{amountDue.toFixed(2)}
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
                    {table.name} ({table.capacity})
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
            guestCount > 20 ||
            !Number.isFinite(amountPaid)
          }
          onClick={async () => {
            setPending(true);
            try {
              await onSave(registration.id, {
                guestCount,
                quantities,
                allocations,
                amountPaid,
                ...(amountPaidChanged ? { paymentReason } : {}),
                ...(amountPaidChanged && paymentTransactionDate ? { paymentTransactionDate } : {}),
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
        <Button
          variant="link"
          size="sm"
          className="px-0"
          onClick={() => setShowPaymentHistory((v) => !v)}
        >
          {showPaymentHistory ? m.admin_payment_history_hide() : m.admin_payment_history_show()}
        </Button>
        {showPaymentHistory && (
          <>
            {paymentHistoryQuery.isLoading && <p className="small">{m.loading()}</p>}
            {paymentHistoryQuery.data && paymentHistoryQuery.data.length === 0 && (
              <p className="small text-secondary">{m.admin_payment_history_empty()}</p>
            )}
            {paymentHistoryQuery.data && paymentHistoryQuery.data.length > 0 && (
              <ListGroup variant="flush">
                {paymentHistoryQuery.data.map((entry) => (
                  <ListGroup.Item key={entry.id} className="px-0 py-1">
                    <div className="small d-flex justify-content-between flex-wrap gap-2">
                      <span>
                        <strong>{paymentReasonLabel(entry.details.reason)}</strong>{" "}
                        {m.admin_payment_history_change({
                          before: String(entry.details.previous_amount_paid ?? ""),
                          after: String(entry.details.amount_paid ?? ""),
                        })}
                      </span>
                      <span className="text-secondary">
                        {typeof entry.details.transaction_date === "string"
                          ? entry.details.transaction_date
                          : entry.timestamp.slice(0, 10)}
                        {" · "}
                        {entry.actor}
                      </span>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </>
        )}
      </fieldset>
    </section>
  );
}
