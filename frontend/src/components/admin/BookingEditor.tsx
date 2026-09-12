import { useMemo, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
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
  Registration,
  RegistrationStatus,
  TableAllocation,
} from "@/types/registration";
import { fetchPaymentTransactions } from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";
import { transactionAmountLabel } from "@/utils/paymentTransactionLabels";
import { toLocalDateKey } from "@/utils/dateUtils";
import { m } from "@/paraglide/messages";

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
        purchasable: false,
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
  const [pending, setPending] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  const form = useForm({
    defaultValues: {
      guestCount: registration.guestCount,
      quantities: purchased,
      allocations: registration.allocations ?? ([] as TableAllocation[]),
      notes: registration.notes,
      status: registration.status,
    },
    onSubmit: async ({ value }) => {
      setPending(true);
      try {
        await onSave(registration.id, {
          guestCount: value.guestCount,
          quantities: value.quantities,
          allocations: value.allocations,
          notes: value.notes,
          status: value.status,
        });
      } finally {
        setPending(false);
      }
    },
  });
  const guestCount = useStore(form.store, (s) => s.values.guestCount);
  const quantities = useStore(form.store, (s) => s.values.quantities);
  const allocations = useStore(form.store, (s) => s.values.allocations);
  const status = useStore(form.store, (s) => s.values.status);

  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionError, setTransactionError] = useState("");

  const transactionForm = useForm({
    defaultValues: {
      amount: "",
      date: toLocalDateKey(new Date()),
      reference: "",
      note: "",
    },
    onSubmit: async ({ value }) => {
      if (!onAddTransaction) return;
      setTransactionPending(true);
      setTransactionError("");
      try {
        await onAddTransaction(registration.id, {
          amount: Number(value.amount),
          effectiveDate: value.date,
          reference: value.reference.trim() || undefined,
          note: value.note.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        });
        transactionForm.setFieldValue("amount", "");
        transactionForm.setFieldValue("reference", "");
        transactionForm.setFieldValue("note", "");
      } catch (err) {
        setTransactionError(err instanceof Error ? err.message : m.admin_error_record_payment());
      } finally {
        setTransactionPending(false);
      }
    },
  });
  const transactionAmount = useStore(transactionForm.store, (s) => s.values.amount);
  const transactionDate = useStore(transactionForm.store, (s) => s.values.date);

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
    form.setFieldValue("allocations", (items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
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
      form.setFieldValue("allocations", (items) =>
        items.map((item) => ({
          ...item,
          exclusive: nextTableQuantity > 0,
          guestCount: nextTableQuantity > 0 ? 0 : Math.max(1, item.guestCount),
        })),
      );
    }
    form.setFieldValue("quantities", next);
  };

  const parsedTransactionAmount = Number(transactionAmount);
  const transactionAmountInvalid =
    transactionAmount.trim() === "" ||
    !Number.isFinite(parsedTransactionAmount) ||
    parsedTransactionAmount === 0;

  return (
    <section aria-labelledby="booking-editor-heading">
      <h6 id="booking-editor-heading" className="text-warning">
        {m.admin_booking_editor()}
      </h6>
      <div className="row g-3">
        <Form.Group className="col-sm-4">
          <Form.Label>{m.admin_guests_count()}</Form.Label>
          <form.Field name="guestCount">
            {(field) => (
              <Form.Control
                aria-label={m.admin_guests_count()}
                type="number"
                min={1}
                max={20}
                value={field.state.value}
                onChange={(event) => field.handleChange(Number(event.target.value))}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </Form.Group>
        <Form.Group className="col-sm-4">
          <Form.Label>{m.admin_status_label()}</Form.Label>
          <form.Field name="status">
            {(field) => (
              <Form.Select
                aria-label={m.admin_status_label()}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as RegistrationStatus)}
                onBlur={field.handleBlur}
              >
                <option value="pending">{m.admin_status_pending()}</option>
                <option value="confirmed">{m.admin_status_confirmed()}</option>
                <option value="cancelled">{m.admin_status_cancelled()}</option>
              </Form.Select>
            )}
          </form.Field>
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
              disabled={!product.purchasable && (purchased[product.id] ?? 0) <= 0}
              value={quantities[product.id] ?? 0}
              onChange={(event) => setProductQuantity(product.id, Number(event.target.value))}
            />
          </Form.Group>
        ))}
        <Form.Group className="col-12">
          <Form.Label>{m.admin_notes()}</Form.Label>
          <form.Field name="notes">
            {(field) => (
              <Form.Control
                as="textarea"
                rows={3}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </Form.Group>
      </div>

      <fieldset className="mt-3">
        <legend className="fs-6">{m.admin_action_assign_table()}</legend>
        <p className="small">
          {m.admin_allocation_progress({
            assigned,
            total: allocationTotal,
            unit: tableQuantity ? m.admin_inventory_unit_table() : m.admin_allocation_unit_person(),
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
              onClick={() => void form.removeFieldValue("allocations", index)}
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
            form.pushFieldValue("allocations", {
              tableId: "",
              guestCount: tableQuantity ? 0 : 1,
              exclusive: tableQuantity > 0,
            })
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
          onClick={() => void form.handleSubmit()}
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
                        <strong>{transactionAmountLabel(entry.amount)}</strong>{" "}
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
                  <Form.Label className="small mb-1">{m.admin_payment_amount_label()}</Form.Label>
                  <transactionForm.Field name="amount">
                    {(field) => (
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.01"
                        style={{ maxWidth: "8rem" }}
                        aria-label={m.admin_payment_amount_label()}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                  <Form.Text className="small">{m.admin_payment_amount_help()}</Form.Text>
                </Form.Group>
                <Form.Group>
                  <Form.Label className="small mb-1">
                    {m.admin_payment_transaction_date()}
                  </Form.Label>
                  <transactionForm.Field name="date">
                    {(field) => (
                      <Form.Control
                        size="sm"
                        type="date"
                        required
                        aria-label={m.admin_payment_transaction_date()}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                </Form.Group>
                <Form.Group>
                  <Form.Label className="small mb-1">
                    {m.admin_payment_reference_label()}
                  </Form.Label>
                  <transactionForm.Field name="reference">
                    {(field) => (
                      <Form.Control
                        size="sm"
                        type="text"
                        style={{ maxWidth: "10rem" }}
                        aria-label={m.admin_payment_reference_label()}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                </Form.Group>
                <Form.Group>
                  <Form.Label className="small mb-1">{m.admin_payment_note_label()}</Form.Label>
                  <transactionForm.Field name="note">
                    {(field) => (
                      <Form.Control
                        size="sm"
                        type="text"
                        style={{ maxWidth: "12rem" }}
                        aria-label={m.admin_payment_note_label()}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                </Form.Group>
                <Button
                  size="sm"
                  disabled={
                    transactionPending || transactionAmountInvalid || transactionDate === ""
                  }
                  onClick={() => void transactionForm.handleSubmit()}
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
