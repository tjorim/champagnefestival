import { type RegistrationSortKey } from "@/lib/api/adminFetch";

export const COL_VIS_KEY = "admin-col-vis-registrations";
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;
// Bulk mutations are one REST call per registration (see executeBulkAction) —
// batching keeps a large "select all matching" action from firing hundreds
// of simultaneous requests at once.
export const BULK_ACTION_BATCH_SIZE = 20;

// Maps a sortable table column's id to the backend `sort` query param it
// corresponds to (see backend/app/routers/registrations.py's _SORT_COLUMNS).
// Sorting is server-side — the table only ever holds one page of rows — so
// every sortable column here must have a backend counterpart.
export const SORT_KEY_BY_COLUMN: Record<string, RegistrationSortKey> = {
  name: "name",
  event: "event",
  guest_count: "guest_count",
  status: "status",
  payment_status: "payment_status",
  checked_in: "checked_in",
};

export type AllocationRef = Pick<
  import("@/api-types").OrganizationOut,
  "id" | "name" | "contact_person_id"
>;

export type EditionFilter = "all" | "festival" | "standalone";

export type DateFilter = "all" | "today";
