import type {
  Room,
  FloorTableRecord,
  FloorArea,
  TableType,
  Layout,
  Venue,
  AuditEntry,
  EditionAttendanceStats,
  EventCheckInStats,
  FaqItem,
  LayoutRevision,
  LayoutRevisionDiff,
  LayoutRestorePreview,
} from "@/types/admin";
import {
  apiToLedgerTransaction,
  apiToPaymentTransaction,
  apiToRegistration,
} from "@/types/registrationMapper";
import type { LedgerTransaction, PaymentTransaction, Registration } from "@/types/registration";
import { type Person, apiToPerson } from "@/types/person";
import {
  downloadFileOrThrow,
  fetchArrayOrThrow,
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { m } from "@/paraglide/messages";
import { devError } from "@/utils/devLog";
import {
  apiVenueToVenue,
  apiLayoutToLayout,
  apiTableTypeToTableType,
  apiRoomToRoom,
  apiTableToTable,
  apiAreaToArea,
  apiAuditEntryToAuditEntry,
  apiEditionStatsToEditionAttendanceStats,
  apiEventCheckInStatsToEventCheckInStats,
  apiFaqItemToFaqItem,
  apiLayoutRevisionToLayoutRevision,
  apiLayoutRevisionDiffToLayoutRevisionDiff,
  apiLayoutRestorePreviewToLayoutRestorePreview,
  attachVolunteerDetails,
  mergePeopleWithVolunteers,
} from "@/utils/adminApiMappers";

export interface RegistrationsPage {
  registrations: Registration[];
  total: number;
  limit: number;
  page: number;
}

interface RegistrationListEnvelope {
  items?: Record<string, unknown>[];
  total?: number;
  limit?: number;
  page?: number;
}

export type RegistrationSortKey =
  | "name"
  | "event"
  | "guest_count"
  | "status"
  | "payment_status"
  | "checked_in";

export interface RegistrationsPageOptions {
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
  authHeaders: () => Record<string, string>,
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
  const payload = await fetchJsonOrThrowWithUnauthorized<RegistrationListEnvelope>(
    `/api/registrations${suffix}`,
    { headers: authHeaders() },
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
    registrations: payload.items.map(apiToRegistration),
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
  authHeaders: () => Record<string, string>,
  options: Omit<RegistrationsPageOptions, "limit" | "page"> = {},
): Promise<Registration[]> {
  const first = await fetchRegistrationsPage(authHeaders, {
    ...options,
    limit: REGISTRATIONS_PAGE_SIZE,
    page: 1,
  });
  const pageCount = Math.ceil(first.total / REGISTRATIONS_PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      fetchRegistrationsPage(authHeaders, {
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

// LayoutEditor's floor-plan occupancy and the dashboard's status/edition/capacity
// aggregates genuinely need the complete working set (they summarize across every
// registration, not one page of it), so this reads every page. The registrations
// *table* itself does not use this — see fetchRegistrationsPage, used directly by
// RegistrationList.
export function fetchAllRegistrations(
  authHeaders: () => Record<string, string>,
): Promise<Registration[]> {
  return fetchAllRegistrationPages(authHeaders);
}

export async function fetchRegistration(
  registrationId: string,
  authHeaders: () => Record<string, string>,
): Promise<Registration> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/registrations/${encodeURIComponent(registrationId)}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return apiToRegistration(payload);
}

export async function fetchTables(
  authHeaders: () => Record<string, string>,
): Promise<FloorTableRecord[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/tables",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiTableToTable) : [];
}

export async function fetchTable(
  tableId: string,
  authHeaders: () => Record<string, string>,
): Promise<FloorTableRecord> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/tables/${encodeURIComponent(tableId)}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return apiTableToTable(payload);
}

export interface TableCreateInput {
  name: string;
  layoutId: string;
  tableTypeId: string;
}

export async function createTable(
  authHeaders: () => Record<string, string>,
  { name, layoutId, tableTypeId }: TableCreateInput,
): Promise<FloorTableRecord> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    "/api/tables",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name,
        x: 10,
        y: 10,
        rotation: 0,
        layout_id: layoutId,
        table_type_id: tableTypeId,
      }),
    },
    m.admin_error_add_table(),
  );
  return apiTableToTable((payload.table ?? payload) as Record<string, unknown>);
}

/** The fields an admin can change on an existing table. */
export type TableUpdateChanges = Partial<
  Pick<FloorTableRecord, "name" | "x" | "y" | "rotation" | "tableTypeId">
>;

function tableUpdateErrorMessage(changes: TableUpdateChanges): string {
  if (changes.tableTypeId !== undefined) {
    return m.admin_error_change_table_type_status({ status: 500 });
  }
  if (changes.name !== undefined) return m.admin_error_update_table_name_status({ status: 500 });
  if (changes.rotation !== undefined) return m.admin_error_persist_table_rotation();
  return m.admin_error_persist_table_position();
}

export async function updateTable(
  authHeaders: () => Record<string, string>,
  tableId: string,
  changes: TableUpdateChanges,
): Promise<void> {
  const { name, x, y, rotation, tableTypeId } = changes;
  await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/tables/${encodeURIComponent(tableId)}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ...(name !== undefined ? { name } : {}),
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(rotation !== undefined ? { rotation } : {}),
        ...(tableTypeId !== undefined ? { table_type_id: tableTypeId } : {}),
      }),
    },
    tableUpdateErrorMessage(changes),
  );
}

export async function deleteTable(
  authHeaders: () => Record<string, string>,
  tableId: string,
): Promise<void> {
  await fetchVoidOrThrowWithUnauthorized(
    `/api/tables/${encodeURIComponent(tableId)}`,
    { method: "DELETE", headers: authHeaders() },
    m.admin_error_delete_table(),
  );
}

export async function fetchVenues(authHeaders: () => Record<string, string>): Promise<Venue[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/venues",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiVenueToVenue) : [];
}

export async function fetchRooms(authHeaders: () => Record<string, string>): Promise<Room[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/rooms",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiRoomToRoom) : [];
}

export async function fetchTableTypes(
  authHeaders: () => Record<string, string>,
): Promise<TableType[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/table-types",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiTableTypeToTableType) : [];
}

export async function fetchLayouts(authHeaders: () => Record<string, string>): Promise<Layout[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/layouts",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiLayoutToLayout) : [];
}

/** List one layout's saved revisions, newest first (#1021). */
export async function fetchLayoutRevisions(
  authHeaders: () => Record<string, string>,
  layoutId: string,
): Promise<LayoutRevision[]> {
  return fetchArrayOrThrow(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions`,
    { headers: authHeaders() },
    m.admin_error_load_layout_revisions(),
    apiLayoutRevisionToLayoutRevision,
  );
}

/** Save an immutable, named snapshot of a layout's current tables/areas (#1021). */
export async function saveLayoutRevision(
  authHeaders: () => Record<string, string>,
  layoutId: string,
  label: string,
  changeNote?: string,
): Promise<LayoutRevision> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        label,
        ...(changeNote?.trim() ? { change_note: changeNote.trim() } : {}),
      }),
    },
    m.admin_error_save_layout_revision(),
  );
  return apiLayoutRevisionToLayoutRevision(payload);
}

/** Compare two snapshots of one layout — each a revision number or the
 * reserved token "current" — matched by stable table/area id (#1021). */
export async function compareLayoutRevisions(
  authHeaders: () => Record<string, string>,
  layoutId: string,
  fromRef: string,
  toRef: string,
): Promise<LayoutRevisionDiff> {
  const params = new URLSearchParams({ from: fromRef, to: toRef });
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions/compare?${params.toString()}`,
    { headers: authHeaders() },
    m.admin_error_compare_layout_revisions(),
  );
  return apiLayoutRevisionDiffToLayoutRevisionDiff(payload);
}

/** Preview what restoring a revision would change, including any live
 * allocations it would delete or move (#1021). */
export async function previewLayoutRestore(
  authHeaders: () => Record<string, string>,
  layoutId: string,
  revisionNumber: number,
): Promise<LayoutRestorePreview> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions/${revisionNumber}/restore/preview`,
    { method: "POST", headers: authHeaders() },
    m.admin_error_preview_layout_restore(),
  );
  return apiLayoutRestorePreviewToLayoutRestorePreview(payload);
}

/** Apply a saved revision's snapshot back onto the layout's tables/areas
 * (#1021). Requires `resolveAllocations` when the preview reports live
 * allocations the restore would delete or move. */
export async function restoreLayoutRevision(
  authHeaders: () => Record<string, string>,
  layoutId: string,
  revisionNumber: number,
  resolveAllocations = false,
): Promise<Record<string, unknown>> {
  return fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/layouts/${encodeURIComponent(layoutId)}/revisions/${revisionNumber}/restore`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ resolve_allocations: resolveAllocations }),
    },
    m.admin_error_restore_layout_revision(),
  );
}

export async function fetchExhibitors(
  authHeaders: () => Record<string, string>,
): Promise<{ id: number; name: string; active: boolean; contactPersonId: string | null }[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/exhibitors",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload)
    ? payload.map((exhibitor: Record<string, unknown>) => ({
        id: Number(exhibitor.id),
        name: String(exhibitor.name ?? ""),
        active: exhibitor.active !== false,
        contactPersonId:
          typeof exhibitor.contact_person_id === "string" ? exhibitor.contact_person_id : null,
      }))
    : [];
}

export async function fetchAreas(authHeaders: () => Record<string, string>): Promise<FloorArea[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>[]>(
    "/api/areas",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload.map(apiAreaToArea) : [];
}

interface PersonListEnvelope {
  items?: Record<string, unknown>[];
  total?: number;
  limit?: number;
  page?: number;
}

// GET /api/people and /api/volunteers page like GET /api/registrations (see
// backend/app/routers/{people,volunteers}.py) — {items, total, limit, page}.
// GET /api/members doesn't exist (retired — it was functionally identical to
// /api/people?role=member; see backend/app/routers/members.py); members are the
// people holding the member role. The People/Volunteers/Members admin tabs are
// full client-side tables (see PeopleManagement/VolunteersManagement/
// MembersManagement), so `fetchAllPersonPages` reads every page. The backend
// caps one page at 1000 rows (`Pagination`), which is the page size here, not a
// limit on how many people there can be.
const PERSON_PAGE_SIZE = 1000;

async function fetchPersonListEnvelope(
  url: string,
  authHeaders: () => Record<string, string>,
): Promise<{ people: Person[]; total: number }> {
  const payload = await fetchJsonOrThrowWithUnauthorized<PersonListEnvelope>(
    url,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  if (
    !Array.isArray(payload.items) ||
    typeof payload.total !== "number" ||
    typeof payload.limit !== "number" ||
    typeof payload.page !== "number"
  ) {
    // A bare array (the old, pre-envelope shape) or any other malformed
    // response must not be swallowed into an empty/zero-valued list — that
    // would look exactly like the silent-truncation bug this endpoint was
    // fixed for (see #931).
    throw new Error(`Invalid ${url} response: expected {items, total, limit, page}.`);
  }
  return { people: payload.items.map(apiToPerson), total: payload.total };
}

/**
 * Reads every page of a person list endpoint. Pages are fetched concurrently
 * once the first one reveals the total. The backend orders both lists
 * deterministically (newest first, then id), so pages do not overlap unless a
 * row is added mid-read, and the result is deduplicated by id for that case.
 */
async function fetchAllPersonPages(
  path: string,
  authHeaders: () => Record<string, string>,
): Promise<Person[]> {
  const separator = path.includes("?") ? "&" : "?";
  const pageUrl = (page: number) => `${path}${separator}limit=${PERSON_PAGE_SIZE}&page=${page}`;
  const first = await fetchPersonListEnvelope(pageUrl(1), authHeaders);
  const pageCount = Math.ceil(first.total / PERSON_PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      fetchPersonListEnvelope(pageUrl(index + 2), authHeaders),
    ),
  );
  const byId = new Map<string, Person>();
  for (const { people } of [first, ...rest]) {
    for (const person of people) byId.set(person.id, person);
  }
  return [...byId.values()];
}

/**
 * People matching a search. A search is one page by design: a query that
 * matches more than a page is too broad to be useful, so that is reported
 * rather than paged through. Volunteer details (help periods) are attached to
 * the matches that hold the volunteer role; volunteers who did not match the
 * query are not added, and the volunteer list is not fetched at all when no
 * match is a volunteer.
 */
export async function fetchPeopleSearch(
  authHeaders: () => Record<string, string>,
  query: string,
): Promise<Person[]> {
  const result = await fetchPersonListEnvelope(
    `/api/people?q=${encodeURIComponent(query.trim())}&limit=${PERSON_PAGE_SIZE}`,
    authHeaders,
  );
  if (result.total > result.people.length) {
    devError(
      `Admin people search matched ${result.total} people but only the first ` +
        `${result.people.length} are shown; narrow the query.`,
    );
  }
  if (!result.people.some((person) => person.roles.includes("volunteer"))) return result.people;
  const volunteers = await fetchAllPersonPages("/api/volunteers", authHeaders);
  return attachVolunteerDetails(result.people, volunteers);
}

/**
 * Every person, with volunteer help periods merged in. All pages are read, so
 * members (the people holding the member role) and volunteers are complete
 * however many people there are.
 */
export async function fetchPeople(authHeaders: () => Record<string, string>): Promise<Person[]> {
  const [people, volunteers] = await Promise.all([
    fetchAllPersonPages("/api/people", authHeaders),
    fetchAllPersonPages("/api/volunteers", authHeaders),
  ]);
  return mergePeopleWithVolunteers(people, volunteers);
}

/** One volunteer with their help periods (`GET /api/volunteers/{id}`). */
export async function fetchVolunteer(
  id: string,
  authHeaders: () => Record<string, string>,
): Promise<Person> {
  const payload = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/volunteers/${encodeURIComponent(id)}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return apiToPerson(payload);
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

export async function fetchAuditEntries(
  authHeaders: () => Record<string, string>,
  filters: AuditEntryFilters = {},
): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (filters.resourceType) params.set("resource_type", filters.resourceType);
  if (filters.resourceId) params.set("resource_id", filters.resourceId);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  params.set("limit", String(filters.limit ?? 50));
  params.set("page", String(filters.page ?? 1));

  return fetchArrayOrThrow(
    `/api/audit?${params.toString()}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiAuditEntryToAuditEntry,
  );
}

/** The chronological payment ledger for one booking (#1019) — the accounting
 * source of truth behind its amountPaid/paymentStatus/refundDue fields. */
export async function fetchPaymentTransactions(
  authHeaders: () => Record<string, string>,
  registrationId: string,
): Promise<PaymentTransaction[]> {
  return fetchArrayOrThrow(
    `/api/registrations/${encodeURIComponent(registrationId)}/transactions`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiToPaymentTransaction,
  );
}

export async function fetchAuditResourceTypes(
  authHeaders: () => Record<string, string>,
): Promise<string[]> {
  const payload = await fetchJsonOrThrowWithUnauthorized<string[]>(
    "/api/audit/resource-types",
    { headers: authHeaders() },
    m.admin_error_load_data(),
  );
  return Array.isArray(payload) ? payload : [];
}

/**
 * Per-event check-in progress, counted by the backend rather than from whatever
 * registrations the client happens to hold. Optionally scoped to one edition.
 */
export async function fetchEventCheckInStats(
  authHeaders: () => Record<string, string>,
  editionId?: string,
): Promise<EventCheckInStats[]> {
  const suffix = editionId ? `?edition_id=${encodeURIComponent(editionId)}` : "";
  return fetchArrayOrThrow(
    `/api/events/checkin-stats${suffix}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiEventCheckInStatsToEventCheckInStats,
  );
}

export async function fetchEditionStats(
  authHeaders: () => Record<string, string>,
): Promise<EditionAttendanceStats[]> {
  return fetchArrayOrThrow(
    "/api/editions/stats",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiEditionStatsToEditionAttendanceStats,
  );
}

export async function fetchFaqItemsAdmin(
  authHeaders: () => Record<string, string>,
): Promise<FaqItem[]> {
  return fetchArrayOrThrow(
    "/api/faq",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    apiFaqItemToFaqItem,
  );
}

export async function downloadRegistrationsCsv(
  authHeaders: () => Record<string, string>,
  eventId: string,
): Promise<void> {
  await downloadFileOrThrow(
    `/api/registrations/export?event_id=${encodeURIComponent(eventId)}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    "guest-list.csv",
  );
}

export async function downloadVolunteersCsv(
  authHeaders: () => Record<string, string>,
): Promise<void> {
  await downloadFileOrThrow(
    "/api/volunteers/export",
    { headers: authHeaders() },
    m.admin_error_load_data(),
    "volunteers-insurance-list.csv",
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

export interface PaymentTransactionsLedgerPage {
  transactions: LedgerTransaction[];
  total: number;
  limit: number;
  page: number;
}

interface PaymentTransactionLedgerEnvelope {
  items?: Record<string, unknown>[];
  total?: number;
  limit?: number;
  page?: number;
}

/**
 * Fetch one page of the payment ledger with booking context, filtered by
 * edition and/or person (#1019) — the in-app drill-down behind the
 * edition/person payment summaries. Bounded, paginated, and sortable
 * (#1032), mirroring ``fetchRegistrationsPage``: a real ``total`` backs
 * server-side paging instead of holding the full filtered set.
 */
export async function fetchPaymentTransactionsLedger(
  authHeaders: () => Record<string, string>,
  filters: PaymentTransactionsLedgerFilters,
): Promise<PaymentTransactionsLedgerPage> {
  const params = new URLSearchParams();
  if (filters.editionId) params.set("edition_id", filters.editionId);
  if (filters.personId) params.set("person_id", filters.personId);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.sortDir) params.set("sort_dir", filters.sortDir);
  params.set("limit", String(filters.limit ?? LEDGER_PAGE_SIZE));
  params.set("page", String(filters.page ?? 1));
  const payload = await fetchJsonOrThrowWithUnauthorized<PaymentTransactionLedgerEnvelope>(
    `/api/registrations/transactions?${params.toString()}`,
    { headers: authHeaders() },
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
    transactions: payload.items.map(apiToLedgerTransaction),
    total: payload.total,
    limit: payload.limit,
    page: payload.page,
  };
}

/** Export the payment ledger, filtered by edition and/or person (#1019). */
export async function downloadPaymentTransactionsCsv(
  authHeaders: () => Record<string, string>,
  filters: { editionId?: string; personId?: string },
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.editionId) params.set("edition_id", filters.editionId);
  if (filters.personId) params.set("person_id", filters.personId);
  const query = params.toString();
  await downloadFileOrThrow(
    `/api/registrations/transactions/export${query ? `?${query}` : ""}`,
    { headers: authHeaders() },
    m.admin_error_load_data(),
    "payment-transactions.csv",
  );
}
