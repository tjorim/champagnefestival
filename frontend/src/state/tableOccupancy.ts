import type { FloorTable, FloorTableRecord } from "@/types/admin";
import type { Registration } from "@/types/registration";

/**
 * Groups registration ids by the table they are allocated to. Occupancy lives
 * on the registrations (their `allocations`), so a seating write only has to
 * update the registrations collection and every table view follows.
 *
 * Matches the server's `registration_ids` for a table: every registration with
 * an allocation on it, in registration order. Callers that must ignore
 * cancelled bookings still filter on `status`.
 */
export function deriveTableRegistrationIds(
  registrations: readonly Registration[],
): Map<string, string[]> {
  const byTable = new Map<string, string[]>();
  for (const registration of registrations) {
    for (const allocation of registration.allocations ?? []) {
      const ids = byTable.get(allocation.tableId);
      if (!ids) byTable.set(allocation.tableId, [registration.id]);
      else if (!ids.includes(registration.id)) ids.push(registration.id);
    }
  }
  return byTable;
}

/** Joins the stored table rows with occupancy derived from the registrations. */
export function withTableOccupancy(
  tables: readonly FloorTableRecord[],
  registrations: readonly Registration[],
): FloorTable[] {
  const byTable = deriveTableRegistrationIds(registrations);
  return tables.map((table) => ({ ...table, registrationIds: byTable.get(table.id) ?? [] }));
}
