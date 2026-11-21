import { useTodayKey } from "@/hooks/useTodayKey";
import { OrderAnswerInputs } from "@/components/OrderAnswers";
import { AdminEmptyState } from "./AdminEmptyState";
import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminTextarea,
  AdminDescription,
} from "@/components/admin/AdminFields";
import { useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";

import { Button } from "@/components/ui/button";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import type { FloorTable } from "@/api-types";
import { toAmount } from "@/features/admin/shared/money";
import type { OrderAnswer } from "@/lib/editions/orderQuestions";
import type { Product } from "@/api-types";
import { NO_PRODUCT_TRANSLATIONS } from "@/types/event";
import type { PaymentTransactionCreate, TableAllocation } from "@/api-types";
import type { BookingUpdate, Registration, RegistrationStatus } from "@/types/registration";
import { fetchPaymentTransactions } from "@/lib/api/adminFetch";
import { queryKeys } from "@/lib/query/queryKeys";
import { transactionAmountLabel } from "@/features/admin/shared/paymentTransactionLabels";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";

function invalidProductQuantity(quantity: number): boolean {
  return !Number.isInteger(quantity) || quantity < 0 || quantity > 1000;
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
          allocation.table_id,
          (occupied.get(allocation.table_id) ?? 0) + allocation.guest_count,
        );
      }
    }
    return occupied;
  }, [registrations, registration.id]);
  const purchased = useMemo(
    () =>
      Object.fromEntries(
        registration.order_items.map((item) => [
          item.product_id,
          item.quantity - item.included_quantity,
        ]),
      ),
    [registration],
  );
  const products = useMemo<Product[]>(() => {
    const current = registration.event?.products ?? [];
    const missing = registration.order_items
      .filter((item) => !current.some((product) => product.id === item.product_id))
      .map((item) => ({
        id: item.product_id,
        event_id: registration.event_id,
        ...NO_PRODUCT_TRANSLATIONS,
        name: item.name,
        description: "",
        price: String(item.price),
        category: item.category,
        purchasable: false,
        required: false,
        created_at: "",
        updated_at: "",
        unit: "item" as const,
        stock: null,
        reserved_quantity: 0,
        available_quantity: null,
        shortage: 0,
        sold_out: false,
        inclusions: null,
        included_product_id: null,
        included_per_guests: null,
      }));
    return [...current, ...missing];
  }, [registration]);
  const bookedPrices = useMemo(
    () => Object.fromEntries(registration.order_items.map((item) => [item.product_id, item.price])),
    [registration],
  );
  const [pending, setPending] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  const form = useForm({
    defaultValues: {
      guestCount: registration.guest_count,
      quantities: purchased,
      allocations: registration.allocations ?? ([] as TableAllocation[]),
      notes: registration.notes,
      orderAnswers: registration.order_answers as OrderAnswer[],
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
          orderAnswers: value.orderAnswers,
          status: value.status,
        });
      } finally {
        setPending(false);
      }
    },
  });
  const orderAnswers = useSelector(form.atom, (s) => s.values.orderAnswers);
  const guestCount = useSelector(form.atom, (s) => s.values.guestCount);
  const quantities = useSelector(form.atom, (s) => s.values.quantities);
  const allocations = useSelector(form.atom, (s) => s.values.allocations);
  const status = useSelector(form.atom, (s) => s.values.status);

  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionError, setTransactionError] = useState("");

  const todayKey = useTodayKey();
  const transactionForm = useForm({
    defaultValues: {
      amount: "",
      date: todayKey,
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
          effective_date: value.date,
          reference: value.reference.trim() || undefined,
          note: value.note.trim() || undefined,
          idempotency_key: crypto.randomUUID(),
        });
        transactionForm.setFieldValue("amount", "");
        transactionForm.setFieldValue("reference", "");
        transactionForm.setFieldValue("note", "");
      } catch (err) {
        setTransactionError(apiErrorMessage(err, m.admin_error_record_payment()));
      } finally {
        setTransactionPending(false);
      }
    },
  });
  const transactionAmount = useSelector(transactionForm.atom, (s) => s.values.amount);
  const transactionDate = useSelector(transactionForm.atom, (s) => s.values.date);

  const ledgerQuery = useQuery({
    queryKey: queryKeys.admin.paymentTransactions(registration.id),
    queryFn: () => fetchPaymentTransactions(authHeaders, registration.id),
    enabled: showLedger,
  });

  const amountDue = products.length
    ? products.reduce(
        (sum, product) =>
          sum + (quantities[product.id] ?? 0) * (bookedPrices[product.id] ?? Number(product.price)),
        0,
      )
    : toAmount(registration.amount_due);
  const amountPaid = toAmount(registration.amount_paid);
  const calculatedTableQuantity = products.reduce(
    (sum, product) => (product.unit === "table" ? sum + (quantities[product.id] ?? 0) : sum),
    0,
  );
  const tableQuantity = products.some((product) => product.unit === "table")
    ? calculatedTableQuantity
    : (registration.booked_table_quantity ?? 0);
  const assigned = tableQuantity
    ? allocations.length
    : allocations.reduce((sum, item) => sum + item.guest_count, 0);
  const allocationTotal = tableQuantity || guestCount;
  const invalidGuestCount = !Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20;
  const invalidAllocation = allocations.some(
    (item) =>
      !item.table_id ||
      !Number.isInteger(item.guest_count) ||
      item.guest_count < (tableQuantity ? 0 : 1) ||
      item.guest_count > 20,
  );

  const changeAllocation = (index: number, patch: Partial<TableAllocation>) =>
    form.setFieldValue("allocations", (items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const allocationShortage = status !== "cancelled" && assigned > allocationTotal;
  const tableReleaseCount = allocations.length - tableQuantity;
  const invalidQuantity = Object.values(quantities).some(invalidProductQuantity);
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
          guestCount: nextTableQuantity > 0 ? 0 : Math.max(1, item.guest_count),
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
      <h3 id="booking-editor-heading" className="text-base font-medium text-highlight">
        {m.admin_booking_editor()}
      </h3>
      <fieldset>
        <legend className="mb-3 text-base font-medium">{m.admin_booking_details()}</legend>
        <div className="flex flex-wrap -mx-2 *:w-full *:px-2 gap-y-4">
          <AdminField className="site-sm:w-4/12">
            <AdminLabel>{m.admin_guests_count()}</AdminLabel>
            <form.Field name="guestCount">
              {(field) => (
                <AdminInput
                  aria-label={m.admin_guests_count()}
                  aria-invalid={invalidGuestCount}
                  aria-describedby={invalidGuestCount ? "booking-guests-error" : undefined}
                  type="number"
                  min={1}
                  max={20}
                  value={field.value}
                  onChange={(event) => field.handleChange(Number(event.target.value))}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
            {invalidGuestCount && (
              <AdminDescription id="booking-guests-error" className="text-destructive">
                {m.admin_registration_guests_invalid()}
              </AdminDescription>
            )}
          </AdminField>
          <AdminField className="site-sm:w-4/12">
            <AdminLabel>{m.admin_status_label()}</AdminLabel>
            <form.Field name="status">
              {(field) => (
                <AdminSelect
                  aria-label={m.admin_status_label()}
                  value={field.value}
                  onValueChange={(event) => field.handleChange(event as RegistrationStatus)}
                  onBlur={field.handleBlur}
                >
                  <AdminOption value="pending">{m.admin_status_pending()}</AdminOption>
                  <AdminOption value="confirmed">{m.admin_status_confirmed()}</AdminOption>
                  <AdminOption value="cancelled">{m.admin_status_cancelled()}</AdminOption>
                </AdminSelect>
              )}
            </form.Field>
          </AdminField>
          <div className="site-sm:w-4/12 text-sm self-end">
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
            <AdminField className="site-sm:w-6/12" key={product.id}>
              <AdminLabel>
                {product.name} · €{(bookedPrices[product.id] ?? Number(product.price)).toFixed(2)}
              </AdminLabel>
              <AdminInput
                aria-label={`${m.admin_booking_quantity()} ${product.name}`}
                aria-invalid={invalidProductQuantity(quantities[product.id] ?? 0)}
                aria-describedby={
                  invalidProductQuantity(quantities[product.id] ?? 0)
                    ? `booking-quantity-${product.id}-error`
                    : undefined
                }
                type="number"
                min={0}
                max={1000}
                disabled={!product.purchasable && (purchased[product.id] ?? 0) <= 0}
                value={quantities[product.id] ?? 0}
                onChange={(event) => setProductQuantity(product.id, Number(event.target.value))}
              />
              {invalidProductQuantity(quantities[product.id] ?? 0) && (
                <AdminDescription
                  id={`booking-quantity-${product.id}-error`}
                  className="text-destructive"
                >
                  {m.admin_registration_quantity_invalid()}
                </AdminDescription>
              )}
            </AdminField>
          ))}
          <AdminField className="w-full">
            <AdminLabel>{m.admin_notes()}</AdminLabel>
            <form.Field name="notes">
              {(field) => (
                <AdminTextarea
                  rows={3}
                  value={field.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>
        </div>

        <OrderAnswerInputs
          admin
          questions={registration.event?.order_questions ?? []}
          answers={orderAnswers}
          onChange={(answers) => form.setFieldValue("orderAnswers", answers)}
          disabled={pending}
        />
      </fieldset>
      <fieldset id="registration-seating" tabIndex={-1} className="mt-4">
        <legend className="text-base font-medium">{m.admin_action_assign_table()}</legend>
        <p className="text-sm">
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
        {allocationShortage && tableQuantity === 0 && (
          <Alert variant="warning">{m.admin_booking_allocation_excess()}</Alert>
        )}
        {invalidAllocation && (
          <p id="booking-allocation-error" className="text-sm text-destructive">
            {m.admin_booking_allocation_error()}
          </p>
        )}
        {allocations.map((entry, index) => (
          <div
            key={`${entry.table_id}:${index}`}
            className="flex flex-wrap gap-2 mb-2 items-center"
          >
            <AdminSelect
              aria-label={m.admin_inventory_unit_table()}
              aria-invalid={!entry.table_id}
              aria-describedby={invalidAllocation ? "booking-allocation-error" : undefined}
              value={entry.table_id}
              onValueChange={(event) => changeAllocation(index, { table_id: event })}
            >
              <AdminOption value="">{m.admin_unassigned()}</AdminOption>
              {tables
                .filter(
                  (table) =>
                    table.id === entry.table_id ||
                    !allocations.some((item) => item.table_id === table.id),
                )
                .map((table) => (
                  <AdminOption key={table.id} value={table.id}>
                    {table.name} (
                    {m.admin_table_capacity_remaining({
                      count: Math.max(0, table.capacity - (tableOccupancy.get(table.id) ?? 0)),
                    })}
                    )
                  </AdminOption>
                ))}
            </AdminSelect>
            <AdminInput
              type="number"
              min={tableQuantity ? 0 : 1}
              max={20}
              aria-label={m.admin_guests_count()}
              aria-invalid={
                !Number.isInteger(entry.guest_count) ||
                entry.guest_count < (tableQuantity ? 0 : 1) ||
                entry.guest_count > 20
              }
              aria-describedby={invalidAllocation ? "booking-allocation-error" : undefined}
              value={entry.guest_count}
              onChange={(event) =>
                changeAllocation(index, { guest_count: Number(event.target.value) })
              }
              className="max-w-24"
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
          variant="outline"
          className="me-2"
          disabled={assigned >= allocationTotal}
          onClick={() =>
            form.pushFieldValue("allocations", {
              table_id: "",
              guest_count: tableQuantity ? 0 : Math.max(1, allocationTotal - assigned),
              exclusive: tableQuantity > 0,
            })
          }
        >
          {m.admin_allocation_add()}
        </Button>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={
            pending ||
            invalidAllocation ||
            allocationShortage ||
            invalidQuantity ||
            invalidGuestCount
          }
          onClick={() => void form.handleSubmit()}
        >
          {m.admin_booking_save_all()}
        </Button>
        <p className="mb-0 text-sm text-subtle">{m.admin_booking_save_help()}</p>
      </div>

      <fieldset
        id="registration-payments"
        tabIndex={-1}
        className="mt-6 border-t border-border pt-4"
      >
        <legend className="text-base font-medium">{m.admin_booking_payments()}</legend>
        <p className="text-sm text-subtle">{m.admin_booking_payment_save_help()}</p>
        <Button variant="link" size="sm" className="px-0" onClick={() => setShowLedger((v) => !v)}>
          {showLedger ? m.admin_payment_history_hide() : m.admin_payment_history_show()}
        </Button>
        {showLedger && (
          <>
            {ledgerQuery.isLoading && <p className="text-sm">{m.loading()}</p>}
            {ledgerQuery.isError && (
              <Alert variant="danger" className="mb-2">
                {m.admin_payment_history_error()}
              </Alert>
            )}
            {ledgerQuery.data && ledgerQuery.data.length === 0 && (
              <AdminEmptyState>{m.admin_payment_history_empty()}</AdminEmptyState>
            )}
            {ledgerQuery.data && ledgerQuery.data.length > 0 && (
              <PresentationList flush className="mb-4">
                {ledgerQuery.data.map((entry) => (
                  <PresentationListItem key={entry.id} className="px-0 py-1">
                    <div className="text-sm flex justify-between flex-wrap gap-2">
                      <span>
                        <strong>{transactionAmountLabel(Number(entry.amount))}</strong>{" "}
                        {Number(entry.amount) >= 0 ? "+" : ""}€{Number(entry.amount).toFixed(2)}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                      <span className="text-subtle">
                        {entry.effective_date} · {entry.recorded_by}
                      </span>
                    </div>
                  </PresentationListItem>
                ))}
              </PresentationList>
            )}
            {onAddTransaction && (
              <div className="flex flex-wrap gap-2 items-end">
                <AdminField>
                  <AdminLabel className="text-sm mb-1">{m.admin_payment_amount_label()}</AdminLabel>
                  <transactionForm.Field name="amount">
                    {(field) => (
                      <AdminInput
                        size="sm"
                        type="number"
                        step="0.01"
                        className="max-w-32"
                        aria-label={m.admin_payment_amount_label()}
                        value={field.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                  <AdminDescription className="text-sm">
                    {m.admin_payment_amount_help()}
                  </AdminDescription>
                </AdminField>
                <AdminField>
                  <AdminLabel className="text-sm mb-1">
                    {m.admin_payment_transaction_date()}
                  </AdminLabel>
                  <transactionForm.Field name="date">
                    {(field) => (
                      <AdminInput
                        size="sm"
                        type="date"
                        required
                        aria-label={m.admin_payment_transaction_date()}
                        value={field.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                </AdminField>
                <AdminField>
                  <AdminLabel className="text-sm mb-1">
                    {m.admin_payment_reference_label()}
                  </AdminLabel>
                  <transactionForm.Field name="reference">
                    {(field) => (
                      <AdminInput
                        size="sm"
                        type="text"
                        className="max-w-40"
                        aria-label={m.admin_payment_reference_label()}
                        value={field.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                </AdminField>
                <AdminField>
                  <AdminLabel className="text-sm mb-1">{m.admin_payment_note_label()}</AdminLabel>
                  <transactionForm.Field name="note">
                    {(field) => (
                      <AdminInput
                        size="sm"
                        type="text"
                        className="max-w-48"
                        aria-label={m.admin_payment_note_label()}
                        value={field.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </transactionForm.Field>
                </AdminField>
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
