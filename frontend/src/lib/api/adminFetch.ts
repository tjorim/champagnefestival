import type {
  AreaOut,
  AuditActorOut,
  AuditEntryOut,
  EditionAttendanceStats,
  EventCheckInStats,
  FaqItemOut,
  FloorArea,
  FloorTableRecord,
  LedgerTransaction,
  Layout,
  LayoutRestorePreview,
  LayoutRevision,
  LayoutRevisionDiff,
  LayoutWithTablesOut,
  PaymentTransaction,
  PaymentTransactionLedgerEnvelope,
  RegistrationDashboardStats,
  RegistrationListEnvelope,
  RegistrationOutWithToken,
  Room,
  TableCreate,
  TableOut,
  TableType,
  Venue,
} from "@/api-types";
import type { Registration } from "@/types/registration";
import type { VolunteerOut } from "@/api-types";
import {
  downloadFileOrThrow,
  fetchArrayOrThrow,
  fetchJsonOrThrow,
  fetchVoidOrThrow,
} from "./adminApi";
import { m } from "@/paraglide/messages";
import { toTableRecord } from "../collections/tableOccupancy";

/** Table query projection: only the envelope's collection key is renamed for the UI. */
export type RegistrationsPage = Omit<RegistrationListEnvelope, "items"> & {
  registrations: Registration[];
};

// Partial on purpose: the check below rejects the pre-#931 bare array instead of trusting the type.
type RegistrationListPayload = Partial<RegistrationListEnvelope>;

export type RegistrationSortKey =
  | "name"
  | "event"
  | "guest_count"
  | "status"
  | "payment_status"
  | "checked_in";

export interface RegistrationsPageOptions {
  signal?: AbortSignal;
  query?: string;
  status?: string;
  eventId?: string;
  tableId?: string;
  personId?: string;
  editionId?: string;
  editionType?: string;
  editionCategory?: "festival" | "standalone";
  /** ISO calendar date (YYYY-MM-DD), matched against the event's date. */
  eventDate?: string;
  sort?: RegistrationSortKey;
  sortDir?: "asc" | "desc";
  limit?: number;
  page?: number;
}

/**
 * Fetch one page of the admin registration list. Mirrors every filter/sort
 * `GET /api/registrations` supports (see backend/app/routers/registrations.py)
 * so the table can paginate server-side instead of holding the full dataset.
 */
export async function fetchRegistrationsPage(
  options: RegistrationsPageOptions = {},
): Promise<RegistrationsPage> {
  const params = new URLSearchParams();
  const trimmedQuery = options.query?.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);
  if (options.status) params.set("status", options.status);
  if (options.eventId) params.set("event_id", options.eventId);
  if (options.tableId) params.set("table_id", options.tableId);
  if (options.personId) params.set("person_id", options.personId);
  if (options.editionId) params.set("edition_id", options.editionId);
  if (options.editionType) params.set("edition_type", options.editionType);
  if (options.editionCategory) params.set("edition_category", options.editionCategory);
  if (options.eventDate) params.set("event_date", options.eventDate);
  if (options.sort) params.set("sort", options.sort);
  if (options.sortDir) params.set("sort_dir", options.sortDir);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.page) params.set("page", String(options.page));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJsonOrThrow<RegistrationListPayload>(
    `/api/registrations${suffix}`,
    { signal: options.signal },
    m.admin_error_load_data(),
  );
  if (
    !Array.isArray(payload.items) ||
    typeof payload.total !== "number" ||
    typeof payload.limit !== "number" ||
    typeof payload.page !== "number"
  ) {
    // A bare array (the old, pre-#931 shape) or any other malformed response
    // must not be swallowed into an empty/zero-valued page — that would look
    // exactly like the silent-truncation bug this endpoint was fixed for.
    throw new Error("Invalid /api/registrations response: expected {items, total, limit, page}.");
  }
  return {
    registrations: payload.items,
    total: payload.total,
    limit: payload.limit,
    page: payload.page,
  };
}

// The backend caps one registrations page at 1000 rows (`Pagination`). That is a
// page size, not a limit on how many registrations there can be.
const REGISTRATIONS_PAGE_SIZE = 1000;

/**
 * Reads every page of the registrations matching `options` (concurrently once
 * the first page reveals the total) and deduplicates by id. The backend orders
 * the list deterministically (newest first, then id), so pages do not overlap
 * unless a row is added mid-read.
 */
export async function fetchAllRegistrationPages(
  options: Omit<RegistrationsPageOptions, "limit" | "page"> = {},
): Promise<Registration[]> {
  const first = await fetchRegistrationsPage({
    ...options,
    limit: REGISTRATIONS_PAGE_SIZE,
    page: 1,
  });
  const pageCount = Math.ceil(first.total / REGISTRATIONS_PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      fetchRegistrationsPage({
        ...options,
        limit: REGISTRATIONS_PAGE_SIZE,
        page: index + 2,
      }),
    ),
  );
  const byId = new Map<string, Registration>();
  for (const { registrations } of [first, ...rest]) {
    for (const registration of registrations) byId.set(registration.id, registration);
  }
  return [...byId.values()];
}

// Operational consumers need one complete edition, while lists remain server-paged.
// Historical floor plans explicitly load one event through fetchAllRegistrationPages.
export function fetchAllRegistrations(
  editionId: string,
  signal?: AbortSignal,
): Promise<Registration[]> {
  if (!editionId) return Promise.resolve([]);
  return fetchAllRegistrationPages({ editionId, signal });
}

export async function fetchRegistration(registrationId: string): Promise<Registration> {
  const payload = await fetchJsonOrThrow<RegistrationOutWithToken>(
    `/api/registrations/${encodeURIComponent(registrationId)}`,
    {},
    m.admin_error_load_data(),
  );
  return payload;
}

export async function fetchTables(): Promise<FloorTableRecord[]> {
  const payload = await fetchArrayOrThrow<TableOut>("/api/tables", {}, m.admin_error_load_data());
  return payload.map(toTableRecord);
}

export async function fetchTable(tableId: string): Promise<FloorTableRecord> {
  const payload = await fetchJsonOrThrow<TableOut>(
    `/api/tables/${encodeURIComponent(tableId)}`,
    {},
    m.admin_error_load_data(),
  );
  return toTableRecord(payload);
}

export type TableCreateInput = Pick<TableCreate, "name" | "layout_id" | "table_type_id">;

export async function createTable({
  name,
  layout_id,
  table_type_id,
}: TableCreateInput): Promise<FloorTableRecord> {
  const payload = await fetchJsonOrThrow<TableOut>(
    "/api/tables",
    {
      method: "POST",

      body: JSON.stringify({ name, x: 10, y: 10, rotation: 0, layout_id, table_type_id }),
    },
    m.admin_error_add_table(),
  );
  return toTableRecord(payload);
}

/** The fields an admin can change on an existing table. */
export type TableUpdateChanges = Partial<
  Pick<FloorTableRecord, "name" | "x" | "y" | "rotation" | "table_type_id">
>;

function tableUpdateErrorMessage(changes: TableUpdateChanges): string {
  if (changes.table_type_id !== undefined) {
    return m.admin_error_change_table_type_status({ status: 500 });
  }
  if (changes.name !== undefined) return m.admin_error_update_table_name_status({ status: 500 });
  if (changes.rotation !== undefined) return m.admin_error_persist_table_rotation();
  return m.admin_error_persist_table_position();
}

export async function updateTable(tableId: string, changes: TableUpdateChanges): Promise<void> {
  await fetchJsonOrThrow<TableOut>(
    `/api/tables/${encodeURIComponent(tableId)}`,
    {
      method: "PUT",

      body: JSON.stringify(changes),
    },
    tableUpdateErrorMessage(changes),
  );
}

export async function deleteTable(tableId: string): Promise<void> {
  await fetchVoidOrThrow(
    `/api/tables/${encodeURIComponent(tableId)}`,
    { method: "DELETE" },
    m.admin_error_delete_table(),
  );
}

/** The fields an admin can change on an existing area (the canvas edits, not the organization assignment). */
export type AreaUpdateChanges = Partial<
  Pick<FloorArea, "label" | "x" | "y" | "rotation" | "width_m" | "length_m">
>;

function areaUpdateErrorMessage(changes: AreaUpdateChanges): string {
  if (changes.width_m !== undefined || changes.length_m !== undefined) {
    return m.admin_error_resize_area_status({ status: 500 });
  }
  if (changes.label !== undefined) return m.admin_error_persist_area_label();
  if (changes.rotation !== undefined) return m.admin_error_persist_area_rotation();
  return m.admin_error_persist_area_position();
}

/** One `PUT` carrying only the changed fields (see `docs/retry-safety.md`: not retry safe). */
export async function updateArea(areaId: string, changes: AreaUpdateChanges): Promise<void> {
  await fetchJsonOrThrow<AreaOut>(
    `/api/areas/${encodeURIComponent(areaId)}`,
    {
      method: "PUT",

      body: JSON.stringify(changes),
    },
    areaUpdateErrorMessage(changes),
  );
}

export async function fetchVenues(): Promise<Venue[]> {
  return fetchArrayOrThrow<Venue>("/api/venues", {}, m.admin_error_load_data());
}

export async function fetchRooms(): Promise<Room[]> {
  return fetchArrayOrThrow<Room>("/api/rooms", {}, m.admin_error_load_data());
}

export async function fetchTableTypes(): Promise<TableType[]> {
  return fetchArrayOrThrow<TableType>("/api/table-types", {}, m.admin_error_load_data());
}

export async function fetchLayouts(): Promise<Layout[]> {
  return fetchArrayOrThrow<Layout>("/api/layouts", {}, m.admin_error_load_data());
}

/** List one layout's saved revisions, newest first (#1021). */
export async function fetchLayoutRevisions(
  layoutId: string,
  signal?: AbortSignal,
): Promise<LayoutRevision[]> {
  return fetchArrayOrThrow<LayoutRevision>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions`,
    { signal },
    m.admin_error_load_layout_revisions(),
  );
}

/** Save an immutable, named snapshot of a layout's current tables/areas (#1021). */
export async function saveLayoutRevision(
  layoutId: string,
  label: string,
  changeNote?: string,
): Promise<LayoutRevision> {
  return fetchJsonOrThrow<LayoutRevision>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions`,
    {
      method: "POST",

      body: JSON.stringify({
        label,
        ...(changeNote?.trim() ? { change_note: changeNote.trim() } : {}),
      }),
    },
    m.admin_error_save_layout_revision(),
  );
}

/** Compare two snapshots of one layout — each a revision number or the
 * reserved token "current" — matched by stable table/area id (#1021). */
export async function compareLayoutRevisions(
  layoutId: string,
  fromRef: string,
  toRef: string,
  signal?: AbortSignal,
): Promise<LayoutRevisionDiff> {
  const params = new URLSearchParams({ from: fromRef, to: toRef });
  return fetchJsonOrThrow<LayoutRevisionDiff>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions/compare?${params.toString()}`,
    { signal },
    m.admin_error_compare_layout_revisions(),
  );
}

/** Preview what restoring a revision would change, including any live
 * allocations it would delete or move (#1021). */
export async function previewLayoutRestore(
  layoutId: string,
  revisionNumber: number,
): Promise<LayoutRestorePreview> {
  return fetchJsonOrThrow<LayoutRestorePreview>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions/${revisionNumber}/restore/preview`,
    { method: "POST" },
    m.admin_error_preview_layout_restore(),
  );
}

/** Apply a saved revision's snapshot back onto the layout's tables/areas
 * (#1021). Requires `resolveAllocations` when the preview reports live
 * allocations the restore would delete or move. */
export async function restoreLayoutRevision(
  layoutId: string,
  revisionNumber: number,
  resolveAllocations = false,
): Promise<LayoutWithTablesOut> {
  return fetchJsonOrThrow<LayoutWithTablesOut>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions/${revisionNumber}/restore`,
    {
      method: "POST",

      body: JSON.stringify({ resolve_allocations: resolveAllocations }),
    },
    m.admin_error_restore_layout_revision(),
  );
}

export async function fetchAreas(): Promise<FloorArea[]> {
  return fetchArrayOrThrow<FloorArea>("/api/areas", {}, m.admin_error_load_data());
}

/** One volunteer with their help periods (`GET /api/volunteers/{id}`). */
export async function fetchVolunteer(id: string): Promise<VolunteerOut> {
  const payload = await fetchJsonOrThrow<VolunteerOut>(
    `/api/volunteers/${encodeURIComponent(id)}`,
    {},
    m.admin_error_load_data(),
  );
  return payload;
}

export interface AuditEntryFilters {
  resourceType?: string;
  resourceId?: string;
  actor?: string;
  action?: string;
  /** Inclusive lower bound, ISO-8601. */
  since?: string;
  /** Inclusive upper bound, ISO-8601. */
  until?: string;
  limit?: number;
  page?: number;
}

export async function fetchAuditEntries(filters: AuditEntryFilters = {}): Promise<AuditEntryOut[]> {
  const params = new URLSearchParams();
  if (filters.resourceType) params.set("resource_type", filters.resourceType);
  if (filters.resourceId) params.set("resource_id", filters.resourceId);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  params.set("limit", String(filters.limit ?? 50));
  params.set("page", String(filters.page ?? 1));

  return fetchArrayOrThrow(`/api/audit?${params.toString()}`, {}, m.admin_error_load_data());
}

/** The chronological payment ledger for one booking (#1019) — the accounting
 * source of truth behind its amountPaid/paymentStatus/refundDue fields. */
export async function fetchPaymentTransactions(
  registrationId: string,
): Promise<PaymentTransaction[]> {
  return fetchArrayOrThrow<PaymentTransaction>(
    `/api/registrations/${encodeURIComponent(registrationId)}/transactions`,
    {},
    m.admin_error_load_data(),
  );
}

export async function fetchAuditResourceTypes(): Promise<string[]> {
  const payload = await fetchJsonOrThrow<string[]>(
    "/api/audit/resource-types",
    {},
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload : [];
}

/**
 * Per-event check-in progress, counted by the backend rather than from whatever
 * registrations the client happens to hold. Optionally scoped to one edition.
 */
export async function fetchEventCheckInStats(editionId?: string): Promise<EventCheckInStats[]> {
  const suffix = editionId ? `?edition_id=${encodeURIComponent(editionId)}` : "";
  return fetchArrayOrThrow(`/api/events/checkin-stats${suffix}`, {}, m.admin_error_load_data());
}

export async function fetchRegistrationDashboardStats(
  editionId: string,
  eventDate: string,
  signal: AbortSignal,
): Promise<RegistrationDashboardStats> {
  const params = new URLSearchParams({ event_date: eventDate });
  if (editionId) params.set("edition_id", editionId);
  return fetchJsonOrThrow(
    `/api/registrations/stats?${params}`,
    { signal },
    m.admin_error_load_data(),
  );
}

export async function fetchEditionStats(): Promise<EditionAttendanceStats[]> {
  return fetchArrayOrThrow("/api/editions/stats", {}, m.admin_error_load_data());
}

export async function fetchFaqItemsAdmin(): Promise<FaqItemOut[]> {
  return fetchArrayOrThrow("/api/faq", {}, m.admin_error_load_data());
}

export async function downloadRegistrationsCsv(eventId: string): Promise<void> {
  await downloadFileOrThrow(
    `/api/registrations/export?event_id=${encodeURIComponent(eventId)}`,
    {},
    m.admin_error_load_data(),
    "guest-list.csv",
  );
}

/** Page size used by the ledger drill-down modal (#1032) — mirrors the
 * server's own default when a caller doesn't specify a limit. */
export const LEDGER_PAGE_SIZE = 50;

export type LedgerSortKey = "effective_date" | "amount";

export interface PaymentTransactionsLedgerFilters {
  editionId?: string;
  personId?: string;
  sort?: LedgerSortKey;
  sortDir?: "asc" | "desc";
  limit?: number;
  page?: number;
}

export type PaymentTransactionsLedgerPage = Omit<LedgerEnvelope, "items"> & {
  transactions: LedgerTransaction[];
};

// Partial on purpose: the check below rejects the pre-#1032 bare array instead of trusting the type.
type LedgerEnvelope = Partial<PaymentTransactionLedgerEnvelope>;

/**
 * Fetch one page of the payment ledger with booking context, filtered by
 * edition and/or person (#1019) — the in-app drill-down behind the
 * edition/person payment summaries. Bounded, paginated, and sortable
 * (#1032), mirroring ``fetchRegistrationsPage``: a real ``total`` backs
 * server-side paging instead of holding the full filtered set.
 */
export async function fetchPaymentTransactionsLedger(
  filters: PaymentTransactionsLedgerFilters,
): Promise<PaymentTransactionsLedgerPage> {
  const params = new URLSearchParams();
  if (filters.editionId) params.set("edition_id", filters.editionId);
  if (filters.personId) params.set("person_id", filters.personId);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.sortDir) params.set("sort_dir", filters.sortDir);
  params.set("limit", String(filters.limit ?? LEDGER_PAGE_SIZE));
  params.set("page", String(filters.page ?? 1));
  const payload = await fetchJsonOrThrow<LedgerEnvelope>(
    `/api/registrations/transactions?${params.toString()}`,
    {},
    m.admin_error_load_data(),
  );
  if (
    !Array.isArray(payload.items) ||
    typeof payload.total !== "number" ||
    typeof payload.limit !== "number" ||
    typeof payload.page !== "number"
  ) {
    // A bare array (the pre-#1032 shape) or any other malformed response must
    // not be swallowed into an empty/zero-valued page — see fetchRegistrationsPage.
    throw new Error(
      "Invalid /api/registrations/transactions response: expected {items, total, limit, page}.",
    );
  }
  return {
    transactions: payload.items,
    total: payload.total,
    limit: payload.limit,
    page: payload.page,
  };
}

/** Export the payment ledger, filtered by edition and/or person (#1019). */
export async function downloadPaymentTransactionsCsv(filters: {
  editionId?: string;
  personId?: string;
}): Promise<void> {
  const params = new URLSearchParams();
  if (filters.editionId) params.set("edition_id", filters.editionId);
  if (filters.personId) params.set("person_id", filters.personId);
  const query = params.toString();
  await downloadFileOrThrow(
    `/api/registrations/transactions/export${query ? `?${query}` : ""}`,
    {},
    m.admin_error_load_data(),
    "payment-transactions.csv",
  );
}

export async function fetchAuditActions(): Promise<string[]> {
  return fetchArrayOrThrow("/api/audit/actions", {}, m.admin_error_load_data());
}

export async function fetchAuditActors(): Promise<AuditActorOut[]> {
  return fetchArrayOrThrow("/api/audit/actors", {}, m.admin_error_load_data());
}
