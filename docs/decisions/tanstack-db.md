# TanStack DB for admin/event-day operational state

**Status:** Adopted for registrations and tables; other resources are open follow-ups (see [Roadmap](#roadmap))
**Adopted:** 2026-05-27, [#442](https://github.com/tjorim/champagnefestival/issues/442) (closed as "adopt, not defer"), pilot merged in [#455](https://github.com/tjorim/champagnefestival/pull/455)
**Record updated:** 2026-10-05, [#1165](https://github.com/tjorim/champagnefestival/issues/1165)

---

## Context

The admin and event-day screens load ten related resources (registrations, tables,
venues, rooms, table types, layouts, exhibitors, areas, people, members). Writes
used to patch each affected TanStack Query cache by hand with `setQueryData`, and
one user action could touch up to four caches (a person update reaches `members`,
`registrations` and `exhibitors`; a table assignment used to reach `registrations`
and `tables` before #1165). A missed patch silently leaves the UI stale.

The first evaluation (2026-05-26) recommended deferring until TanStack DB reached
1.0 and a live event stream existed. #442 reversed that: the packages were stable
enough for a narrow production pilot, and the SSE live-update layer
([#446](https://github.com/tjorim/champagnefestival/issues/446)) now exists, which is
where a collection pays off most. The original deferral reasoning is in Git history
(the version of this file before #1169).

## What was built

The pilot domain is **registrations** (including the table, check-in, strap,
payment, order and delivery fields carried on each registration).

- `frontend/src/state/adminRegistrationsCollection.ts`: the collection factory,
  live-event patching and reset helpers.
- `frontend/src/hooks/useAdminQueries.ts`: creates the collection and reads it.
- `frontend/src/state/LiveUpdatesProvider.tsx`: routes live events to the patching
  helpers.

### Collection and reads

`createAdminRegistrationsCollection` builds the collection with `createCollection`
and `queryCollectionOptions` from `@tanstack/query-db-collection`:

- `queryKey: queryKeys.admin.registrations`, `queryFn: fetchAllRegistrations`,
  `getKey: (registration) => registration.id`.
- `enabled` follows `visible && isAuthenticated`; `staleTime` is 60 seconds and
  `retry` is `false`, matching the other admin queries.
- `useAdminQueries` memoizes one collection per `(enabled, authHeaders,
  queryClient)` and reads it with `useLiveQuery(() => collection, [collection])`.
  It exposes a `registrationsQuery` shaped like a query result (`data`, `error`
  from `collection.utils.lastError`, `isPending` from the live query's
  `isLoading`, `isFetching` from `collection.utils.isFetching`) so callers such as
  `AdminDashboard` did not need to change.

### Live-event patching

`LiveUpdatesProvider` receives invalidation envelopes from the SSE stream. When the
registrations query has succeeded and
`canPatchAdminRegistrationLiveEvent(envelope)` is true (an active collection is
registered, the topic is one of `check_in`, `delivery`, `order`, `registration` or
`seating`, the envelope carries the registrations key, and it has a
`scope.registration_id`), the provider calls `patchAdminRegistrationLiveEvent`
instead of invalidating the whole registrations query:

- `registration` + `deleted` removes the row with `collection.utils.writeDelete`.
- Any other matching event refetches that single registration with
  `fetchRegistration` and upserts it with `collection.utils.writeUpsert`.
- A per-registration timestamp map drops events older than the newest one seen,
  both before the fetch and after it resolves, so out-of-order delivery cannot
  overwrite newer state.
- Patches are applied to every collection registered through
  `registerAdminRegistrationsCollection` (a collection registers on mount and
  unregisters on unmount; the timestamp map is cleared when the last one leaves).
- The check-in statistics nested under the registrations key
  (`queryKeys.admin.eventCheckInStats`) are server-counted, so they are still
  invalidated explicitly on a patched event.
- If a patch cannot be applied or the fetch fails, the provider falls back to
  `invalidateQueries` on the registrations key. Events that cannot be patched
  (no `registration_id`, other topics) and stream reconnects (`onReconnect`) also
  use plain invalidation.

### Reset behavior

`resetAdminRegistrationsCollection` deletes every row in one `writeBatch` and drops
the matching timestamps. `useAdminQueries` calls it, and removes the query cache
entry, whenever `isAuthenticated` becomes false, so no registration data survives
sign-out.

### Writes today

The pilot migrated reads and live updates. Registration writes still go through
`useMutation` hooks (`useRegistrationAdminMutations.ts`) and then patch the same
query key with `queryClient.setQueryData` in `useAdminRegistrationActions.ts`. The
collection observes that query cache, so those patches reach `useLiveQuery`. No
registration write handlers (`onInsert`, `onUpdate`, `onDelete`) exist yet.

## Tables ([#1165](https://github.com/tjorim/champagnefestival/issues/1165))

`tables` is the second collection-backed domain.

- `frontend/src/state/adminTablesCollection.ts`: the collection factory, write
  helpers, live-event patching and reset. `useAdminQueries` creates it beside the
  registrations collection and registers it for live events.
- **Rows hold no occupancy.** A stored row is a `FloorTableRecord` (the table
  without `registrationIds`); `apiTableToTable` ignores the server's
  `registration_ids`. `frontend/src/state/tableOccupancy.ts` groups registration
  ids by `allocation.tableId` over the registrations collection's rows, and
  `useAdminQueries` joins them into the `FloorTable[]` the views already consume.
  Assigning, moving or removing a registration's table is therefore one
  registrations write, and the check-in and seating views follow it; nothing
  patches or invalidates a tables cache for it.
- **Occupancy shape.** Occupancy is derived in a single in-memory pass (one
  grouping over the registrations live query) rather than one live query per
  table. That avoids depending on the equality-partition conditions of
  `@tanstack/db` 0.11 (`eq(field, literal)` with no other clauses) and returns
  the source rows unmodified.
- **Writes.** Position, rotation, rename and table-type changes are optimistic
  through the collection's `onUpdate` handler: one `PUT` per changed row, an
  explicit `collection.utils.refetch()` and `{ refetch: false }` on success, a
  refetch before rollback on failure. Create and delete are not optimistic (a
  create needs the server's id and capacity; the server rejects deleting a table
  that still holds bookings), so they call the API and then apply
  `writeUpsert`/`writeDelete`. Layout and venue deletes remove their tables with
  `writeDelete`, and a layout revision restore replaces the layout's tables with
  one `writeBatch`. Retry-safety decisions are in `docs/retry-safety.md`.
- **Live events.** A `seating` event with a `table_id` and no `registration_id`
  (table created/updated/deleted) patches one row: `writeDelete` for `deleted`,
  otherwise `fetchTable` and `writeUpsert`, with the same per-id timestamp guard
  as registrations and a fallback `invalidateQueries` on the tables key. A
  `seating` event with a `registration_id` is an allocation change; it only
  touches the registrations key, because occupancy is derived and no table row
  changes. Reconnects still invalidate both keys.
- **Reset and refresh.** `isAuthenticated` turning false empties the collection
  and removes its query. `"tables"` is no longer in `ADMIN_RESOURCE_KEYS`;
  `loadData` refetches the collection through `utils.refetch()` and no
  `useQuery`/`setQueryData` path for tables remains.

## Rules that still apply

These come from #442 and apply to every further migration:

1. **Do not add TanStack DB unless it reduces real complexity.** Each migration
   must remove more patching code than it adds.
2. **Never serve one domain from both a collection and a standalone `useQuery`.**
   A migrated resource is removed from `ADMIN_RESOURCE_KEYS` and
   `shouldRefetchAdminResourceQuery` in `useAdminQueries.ts` and has no remaining
   `useQuery` or `setQueryData` path.
3. **Keep payloads normalized** so a resource has one authoritative copy; derive
   views (for example table occupancy) from the collection rather than storing
   them twice.
4. **Keep MSW handlers aligned with collection-backed tests** and define how the
   collection is reset between tests and on sign-out.
5. **Document retry safety.** Every new or changed write needs an entry in
   [`docs/retry-safety.md`](../retry-safety.md); do not advertise or automatically
   retry a write unless that strategy is implemented and tested. Moving a write
   behind a collection handler does not make it retry safe.

## `@tanstack/query-db-collection` 1.3 notes for new write handlers

Installed versions: `@tanstack/db` 0.11.3, `@tanstack/react-db` ^0.5.3,
`@tanstack/query-db-collection` ^1.3.4.

- **Auto-refetch after a handler is deprecated.** A write handler
  (`onInsert`/`onUpdate`/`onDelete`) should call `collection.utils.refetch()`
  explicitly and return `{ refetch: false }` instead of relying on the implicit
  refetch.
- Direct writes (`writeUpsert`, `writeDelete`, `writeBatch`) return a promise that
  resolves once the write is applied (1.3.2). The live-event patching does not
  await it yet ([#1167](https://github.com/tjorim/champagnefestival/issues/1167)).
- `tx.when('settled')` and `$hasPendingWrites` (`@tanstack/db` 0.11.1) can confirm
  a server response and show pending state.
- Rows returned from a live query are the source collection's row objects, not
  copies. Do not mutate them.

## Roadmap

| Follow-up | Issue |
| --- | --- |
| Migrate `people` and `members` (fixes the up-to-four-cache person update) | [#1164](https://github.com/tjorim/champagnefestival/issues/1164) |
| Decide per resource for venues, rooms, areas, layouts, table types and exhibitors (migrate, or stay on Query with `invalidateQueries`) | [#1166](https://github.com/tjorim/champagnefestival/issues/1166) |
| Await write receipts in registration live-event patching | [#1167](https://github.com/tjorim/champagnefestival/issues/1167) |
| Explore persisted collections for event-day resilience (privacy, staleness, offline) | [#1168](https://github.com/tjorim/champagnefestival/issues/1168) |

The per-resource decisions from #1166 will be recorded in this file when made.

## References

- TanStack DB: <https://tanstack.com/db>
- Related issue [#441](https://github.com/tjorim/champagnefestival/issues/441):
  TanStack Router/Query architecture standardization
- Live-update stream: [#446](https://github.com/tjorim/champagnefestival/issues/446)
- `frontend/src/state/adminRegistrationsCollection.ts`
- `frontend/src/state/adminTablesCollection.ts`, `frontend/src/state/tableOccupancy.ts`
- `frontend/src/hooks/useAdminQueries.ts`
- `frontend/src/state/LiveUpdatesProvider.tsx`
- `frontend/src/hooks/useAdminRegistrationActions.ts`: current registration write
  patches
