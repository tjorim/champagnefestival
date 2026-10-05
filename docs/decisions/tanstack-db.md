# TanStack DB for admin/event-day operational state

**Status:** Adopted for registrations, tables and people (members and volunteers are derived from people); other resources are open follow-ups (see [Roadmap](#roadmap))
**Adopted:** 2026-05-27, [#442](https://github.com/tjorim/champagnefestival/issues/442) (closed as "adopt, not defer"), pilot merged in [#455](https://github.com/tjorim/champagnefestival/pull/455)
**Record updated:** 2026-10-05, [#1164](https://github.com/tjorim/champagnefestival/issues/1164)

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
- **Writes.** Position, rotation, rename, table-type changes and deletes are
  optimistic through the collection's `onUpdate`/`onDelete` handlers: one request
  per changed row, an explicit `collection.utils.refetch()` and
  `{ refetch: false }` on success, and a refetch before rollback on failure.
  Create is not optimistic (the server assigns the id and the table type's
  capacity), so `addAdminTable` calls the API and then applies `writeUpsert`.
  The rule for further collections: server-generated rows use a direct write,
  changes the client already knows the outcome of use a handler. A delete the
  server will refuse is also blocked up front: the layout editor disables the
  delete button while the derived occupancy shows bookings on the table. Layout
  and venue deletes remove their tables with `writeDelete`, and a layout
  revision restore replaces the layout's tables with one `writeBatch`.
  Retry-safety decisions are in `docs/retry-safety.md`.
- **Live events.** A `seating` event with a `table_id` and no `registration_id`
  (table created/updated/deleted) patches one row: `writeDelete` for `deleted`,
  otherwise `fetchTable` and `writeUpsert`, with the same per-id timestamp guard
  as registrations and a fallback `invalidateQueries` on the tables key. A
  `seating` event with a `registration_id` is an allocation change; it only
  touches the registrations key, because occupancy is derived and no table row
  changes. Reconnects still invalidate both keys.
- **Session fence.** A response that arrives after sign-out or a collection swap
  must not be written into the replacement state. `state/epochFence.ts` gives
  each collection module an epoch that advances on reset and on
  (un)registration. The registrations and table live-event patchers capture it
  before their fetch and drop the row if it moved; table writes that follow an
  API call (create, layout/venue delete cascades, revision restore) do
  the same through `captureAdminTablesFence()`. Deletes only touch rows the
  collection still holds, because `writeDelete` throws for a missing key.
  `handleAddRegistration` no longer seeds an unloaded registrations list with a
  single row. Venues, rooms, layouts, areas and table types are still plain
  queries whose `setQueryData` calls can recreate an entry after sign-out; the
  direction recorded in [#1166](https://github.com/tjorim/champagnefestival/issues/1166)
  is to migrate them and fix this as part of that work.
- **Reset and refresh.** `isAuthenticated` turning false empties the collection
  and removes its query. `"tables"` is no longer in `ADMIN_RESOURCE_KEYS`;
  `loadData` refetches the collection through `utils.refetch()` and no
  `useQuery`/`setQueryData` path for tables remains.

## People and members ([#1164](https://github.com/tjorim/champagnefestival/issues/1164))

`people` is the third collection-backed domain; `members` and `volunteers` are views over it.

- `frontend/src/state/adminPeopleCollection.ts`: `createAdminPeopleCollection`
  builds one collection from `fetchPeople` (which merges the volunteer help
  periods in) with `queryCollectionOptions` and `getKey: (person) => person.id`.
  `useAdminQueries` reads it with `useLiveQuery` and exposes query-shaped
  `peopleQuery`/`membersQuery` objects, so `AdminDashboard` reads them as before.
- **Members and volunteers are derived, not stored.** A member (or volunteer) is a
  person holding that role, so `membersQuery.data` is `selectMembers(people)` and
  `volunteersQuery.data` is `selectVolunteers(people)`; both share the people
  collection's loading and error state, and `AdminDashboard` no longer computes
  volunteers itself. There is no members collection, no member-only fetch
  (`fetchMembers` and `queryKeys.admin.members` are gone) and no member-sync code:
  a person update, role change or delete reaches the members view by itself (rule 3
  below: derive views instead of storing them twice). An earlier iteration of this
  migration had a second collection kept in step by hand; that reintroduced the
  multi-cache patching this issue set out to remove.
- **No list cap.** `fetchPeople` reads every page of `/api/people` and
  `/api/volunteers` (`fetchAllPersonPages`): the first page reveals the total and
  the remaining pages are fetched concurrently. The backend's 1,000-row ceiling is
  the page size, not a limit on how many people there can be, so the old
  "showing N of M" warning is gone, and members and volunteers are complete by
  construction (which is also why no role-filtered members request is needed).
  Both lists are ordered deterministically, and rows are deduplicated by id in case
  one is added mid-read. A people *search* (`fetchPeopleSearch`) stays one page: a
  query matching more than a page is too broad to be useful, so it is reported
  instead. It returns only the people that matched: help periods are attached to
  matching volunteers (and the volunteer list is only fetched when one matched),
  but volunteers who did not match are never added to the results. The registrations list is read the same way: `fetchAllRegistrations` (the registrations collection's `queryFn`) and the registration list's "select/export all matching" read every page through `fetchAllRegistrationPages`, so there is no cap or truncation warning there either.
- **Writes are direct, not handlers.** The admin forms validate server-side, and
  the server assigns ids and `updated_at`, so nothing is shown optimistically.
  `useAdminPeopleActions` keeps one `useMutation` per API call and then calls an
  `applyAdmin…` helper that writes the server's row into the collection (create,
  update, delete, the volunteer variants, and merge, which removes the duplicate
  and keeps the survivor's own help periods; a survivor the collection does not hold
  yet is inserted, with a volunteer's help periods loaded from
  `GET /api/volunteers/{id}`, or not inserted at all if that fails, so an empty list
  is never shown as the real one). That replaces the roughly 22
  `setQueryData` calls on the people and members keys. The registrations and
  exhibitors copies of a person are still patched with `setQueryData` there (those
  domains are out of scope here; see #1166).
- **Refetch.** `usePeopleMutations`' `onSettled` calls `collection.utils.refetch()`
  explicitly through `refetchAdminPeople`. The per-person queries nested under
  the people key (`peopleRegistrations`, `peoplePaymentSummary`) share its prefix
  but are plain queries, so `invalidateAdminPersonDetailQueries` invalidates them
  with a depth predicate; invalidating the bare key would refetch the collection a
  second time.
- **Session fence and reset.** Each action captures `captureAdminPeopleFence()`
  before its request. The collection helpers drop the write if it moved, and the
  actions check it again before patching the registrations and exhibitors caches
  and the open registration detail, so a response from an earlier session never
  reaches the next session's rows. The fence moves on sign-out
  (`resetAdminPeopleCollection`) and on collection swaps (`registerAdminPeopleCollection`).
  A local write that fails after the server committed (for example a
  collection whose sync stopped) is not reported as a failed action; the refetch
  reconciles. `isAuthenticated` turning false empties the collection and removes
  the people query key (and the nested per-person queries).
- **Keys.** `"people"` is no longer in `ADMIN_RESOURCE_KEYS`; `loadData` refetches
  the collection through `refetchAdminPeople`, and no `useQuery`/`setQueryData`
  path for people or members remains.
- **No live events.** The stream carries no people topic today, so there is no
  live patching or timestamp map for this collection.
- Retry-safety decisions are in `docs/retry-safety.md`.

## Rules that still apply

These come from #442 and apply to every further migration:

1. **Do not add TanStack DB unless it reduces real complexity, or the
   migration is needed to keep the admin state pattern consistent.** Each
   migration should remove more patching code than it adds; since 2026-10-05
   ([#1166](https://github.com/tjorim/champagnefestival/issues/1166)) the
   remaining admin resources are expected to migrate for consistency, and the
   collections' pre-1.0 status is an accepted risk.
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

Order once [#1164](https://github.com/tjorim/champagnefestival/issues/1164) (PR #1173) has merged:

| Order | Follow-up | Issue |
| --- | --- | --- |
| 1 | Extract a shared collection factory (registration, sign-out reset, session fence, guarded writes) with a selectable sync mode, then migrate venues, rooms, areas, layouts and table types as a group, then exhibitors (people and members are done, see [above](#people-and-members-1164)). Default is migrate; staying on Query needs a stated reason | [#1166](https://github.com/tjorim/champagnefestival/issues/1166) |
| 2 | Server-driven admin data tables, phase 1 spike and decision: TanStack Table manual mode, on-demand collection sync or Query with `keepPreviousData`, one paged list contract. Read-only, so it may run in parallel with order 1 | [#1174](https://github.com/tjorim/champagnefestival/issues/1174) |
| 3 | Explore persisted collections for event-day resilience (privacy, staleness, offline). Taken after the #1174 spike, because a partial on-demand cache must not be persisted as if complete; its privacy question can proceed earlier | [#1168](https://github.com/tjorim/champagnefestival/issues/1168) |
| 4 | Server-driven admin data tables, phases 2 to 5: backend list contract, on-demand data layer with optimistic handlers, `AdminDataTable`, screen migration | [#1174](https://github.com/tjorim/champagnefestival/issues/1174) |

Done: [#1167](https://github.com/tjorim/champagnefestival/issues/1167) (write receipts in registration live-event patching), [#1165](https://github.com/tjorim/champagnefestival/issues/1165) (tables and occupancy), [#1169](https://github.com/tjorim/champagnefestival/issues/1169) (this record).

The per-resource decisions from #1166 will be recorded in this file when made; the default is to migrate.

## References

- TanStack DB: <https://tanstack.com/db>
- Related issue [#441](https://github.com/tjorim/champagnefestival/issues/441):
  TanStack Router/Query architecture standardization
- Live-update stream: [#446](https://github.com/tjorim/champagnefestival/issues/446)
- `frontend/src/state/adminRegistrationsCollection.ts`
- `frontend/src/state/adminTablesCollection.ts`, `frontend/src/state/tableOccupancy.ts`
- `frontend/src/state/adminPeopleCollection.ts`
- `frontend/src/hooks/useAdminQueries.ts`
- `frontend/src/state/LiveUpdatesProvider.tsx`
- `frontend/src/hooks/useAdminRegistrationActions.ts`: current registration write
  patches
