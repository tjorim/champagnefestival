# TanStack DB for admin/event-day operational state

**Status:** TanStack DB adopted for registrations, tables, the venue group (venues, rooms, table types, layouts, areas) and organizations. People, members and volunteers use server-driven TanStack Query pages with mutation callbacks (#1179/#1181), not a collection or on-demand sync. See [Remaining resources](#remaining-resources-1166), [Roadmap](#roadmap) and the [server-driven table decision](#server-driven-tables-query-with-keeppreviousdata-not-on-demand-sync-1175).
**Adopted:** 2026-05-27, [#442](https://github.com/tjorim/champagnefestival/issues/442) (closed as "adopt, not defer"), pilot merged in [#455](https://github.com/tjorim/champagnefestival/pull/455)
**Record updated:** 2026-10-07, [#1174](https://github.com/tjorim/champagnefestival/issues/1174), [#1182](https://github.com/tjorim/champagnefestival/issues/1182), 2026-10-06, [#1168](https://github.com/tjorim/champagnefestival/issues/1168), 2026-10-05, [#1166](https://github.com/tjorim/champagnefestival/issues/1166), [#1183](https://github.com/tjorim/champagnefestival/issues/1183), [#1184](https://github.com/tjorim/champagnefestival/issues/1184), [#1175](https://github.com/tjorim/champagnefestival/issues/1175)

---

## Context

The admin and event-day screens load ten related resources (registrations, tables,
venues, rooms, table types, layouts, organizations, areas, people, members). Writes
used to patch each affected TanStack Query cache by hand with `setQueryData`, and
one user action could touch up to four caches (a person update reaches `members`,
`registrations` and `organizations`; a table assignment used to reach `registrations`
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

- `queryKey: queryKeys.admin.registrationsEdition(editionId)`, `queryFn: fetchAllRegistrations` (only that edition),
  `getKey: (registration) => registration.id`.
- `enabled` follows `visible && isAuthenticated`; `staleTime` is 60 seconds and
  `retry` is `false`, matching the other admin queries.
- `useAdminQueries` memoizes one collection per `(editionId, enabled, authHeaders,
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
  single row. The venue group was later migrated with the same fence
  (see [#1183](#venues-rooms-table-types-layouts-and-areas-1183)), and organizations
  followed (see [#1184](#organizations-1184)).
- **Reset and refresh.** `isAuthenticated` turning false empties the collection
  and removes its query. `"tables"` is no longer in `ADMIN_RESOURCE_KEYS`;
  `loadData` refetches the collection through `utils.refetch()` and no
  `useQuery`/`setQueryData` path for tables remains.

## People and members ([#1164](https://github.com/tjorim/champagnefestival/issues/1164))

The #1164 implementation loaded the complete people set into one collection and
derived members and volunteers from roles. It used direct writes, session fences
and exhaustive page reads. #1179/#1181 replaced it on 2026-10-06 with server Query
pages and optimistic mutation callbacks; the collection, selectors and direct-write
helpers were removed. See the [current Query contract](../people-query-layer.md).

The detailed retired implementation is preserved in
[Git history at 311cb1d](https://github.com/tjorim/champagnefestival/blob/311cb1d/docs/decisions/tanstack-db.md#people-and-members-1164).

## Venues, rooms, table types, layouts and areas ([#1183](https://github.com/tjorim/champagnefestival/issues/1183))

The venue group is the fourth collection-backed domain: five collections, one per
resource, built together and registered, reset and fenced as a group.

- `frontend/src/state/adminVenueCollections.ts`: `createAdminVenueCollections`
  builds the venues, rooms, table types, layouts and areas collections with
  `createAdminCollection` in the default `eager` sync mode (small, rarely changing
  lists). `useAdminQueries` creates the group in one `useMemo`, reads each with
  `useLiveQuery` and exposes query-shaped `venuesQuery`, `roomsQuery`,
  `tableTypesQuery`, `layoutsQuery` and `areasQuery` objects (`data`, `error` from
  `lastError`, `isPending`, `isFetching`), so `AdminDashboard` reads them as
  before. It also returns `venueCollections` for the actions; the per-resource
  query-key props of `useAdminVenueActions` and `useVenueMutations` are gone.
- **One authoritative copy each; views are derived.** The rooms of a venue, the
  layouts of a room and the areas of a layout are filters over the collections
  (the consumers already filter), never second stores. The dashboard's
  `useQuery` calls and the roughly 30 `setQueryData` calls (21 in
  `useAdminVenueActions.ts`, 9 in `useVenueMutations.ts`) are replaced by the
  writes below.
- **Writes are direct, except the area canvas edits.** The server assigns ids and
  defaults, so a create, a venue/room/table-type/layout update and an area's
  organization assignment call the API and then write the server's row
  (`applyAdminVenueRowCreated`/`applyAdminVenueRowUpdated`, which does not invent
  a row the collection no longer holds). Moving, rotating, resizing and relabelling
  an area are changes the client already knows the outcome of (a dragged area must
  follow the pointer), so they run through the areas collection's `onUpdate`
  handler like table edits: one `PUT` per changed area, an explicit `refetch()` and
  `{ refetch: false }` on success, a refetch before the rollback on failure; the
  handler takes the group fence before its first request and, once it moves,
  sends no further `PUT` and skips both refetches. That
  replaces the four optimistic `useMutation`s with `onMutate`/`onError` snapshots.
- **Cascades are collection writes.** A venue delete removes the venue, its rooms,
  those rooms' layouts and those layouts' areas (`applyAdminVenueDeleted`, which
  returns the removed layout ids so `removeAdminTablesForLayouts` can remove the
  tables from the tables collection). A layout delete removes the layout and its
  areas (`applyAdminLayoutDeleted`) and its tables. A layout revision restore
  replaces the layout's areas with one `writeBatch`
  (`replaceAdminAreasForLayout`), next to the existing tables replacement. A
  table-type capacity change refetches the tables collection (a table's capacity
  comes from its type); a rename does not.
- **Refetch.** Each mutation's `onSettled` refetches the collections it touched
  through `refetchAdminVenueCollections` (the implicit refetch is deprecated).
  `loadData` refetches the whole group. A layout copy refetches layouts, areas and
  tables, because the server creates areas and tables with fresh ids.
- **Session fence and reset.** `captureAdminVenueFence()` is true only while none of
  the five lifecycles has advanced. Every action captures it before its request and
  checks it before the local write; the `onMutate` of each mutation captures it so
  the follow-up refetch is skipped when the session ended meanwhile. The fence
  moves on sign-out (`resetAdminVenueCollections`) and on collection swaps
  (`registerAdminVenueCollections`). A local write that fails after the server
  committed is not reported as a failed action; the refetch reconciles.
  `isAuthenticated` turning false empties all five collections and removes their
  query keys. Tests: `tests/state/adminVenueCollections.test.ts`,
  `tests/hooks/useAdminVenueCollections.test.tsx`,
  `tests/hooks/useAdminSignOutCache.test.tsx`.
- **Keys.** `"venues"`, `"rooms"`, `"table-types"`, `"layouts"` and `"areas"` are no
  longer in `ADMIN_RESOURCE_KEYS`; `ADMIN_RESOURCE_KEYS` was then `registrations` and
  `organizations` (organizations left it in [#1184](#organizations-1184)). No `useQuery` or
  `setQueryData` path remains for the five.
- **MSW.** The mock `DELETE /api/layouts/:id` now removes the layout's tables and
  areas like the real API, so a refetch after a layout delete agrees with the
  collections' local cascade. `PUT /api/areas/:id` already accepts partial bodies.
- **No live events.** The stream carries no topic for these resources today.
- Retry-safety decisions are in `docs/retry-safety.md`. The shared
  `persistThenRefetch` helper for write handlers moved into
  `adminCollectionFactory.ts` and serves both the tables and areas handlers.

## Organizations ([#1184](https://github.com/tjorim/champagnefestival/issues/1184))

Organizations were the last admin resource served by `useQuery` plus hand-written
`setQueryData` patches, and the last cross-collection patch left by the people
migration. They are now one eager collection on the shared factory
(`createAdminCollection<Organization, number>`, keyed by the numeric id) in
`state/adminOrganizationsCollection.ts`, with its own `createAdminCollectionLifecycle`.

- **Writes.** The organization forms live in the generic `ContentSection`, which
  saves, archives, restores, bulk-archives and deletes through its own mutations
  and then calls `onItemSaved` / `onItemDeleted`. The dashboard handlers write
  the server's response into the collection (`applyAdminOrganizationSaved`,
  `applyAdminOrganizationDeleted`); there are no optimistic handlers because the
  forms validate server-side. The response is the whole row and nothing else
  changes with it, so a save or delete needs no follow-up refetch.
- **People merge.** `handleMergePeople` repoints `contactPersonId` from the
  duplicate to the survivor with one collection write
  (`applyAdminOrganizationContactsMerged`) and refetches the organizations, instead of
  `setQueryData`. A failed merge may still have committed, so the failure path
  refetches too (the previous `onSettled` invalidation did the same). The
  organizations key is no longer passed to `usePeopleMutations`.
- **Session fence.** `ContentSection` takes an optional `captureFence` prop and
  calls it before each write request (save, archive, restore, bulk archive,
  delete); the fence is handed to `onItemSaved` / `onItemDeleted` as `isCurrent`.
  `captureAdminOrganizationsFence()` moves on sign-out
  (`resetAdminOrganizationsCollection`) and on collection swaps
  (`registerAdminOrganizationsCollection`), so a response that arrives later is
  dropped and never recreates a row. The merge refetch is skipped when the fence
  moved. The old `prev ? … : prev` guard in the dashboard is gone with the
  patches it protected; `useAdminQueries` still removes the organizations query key
  on sign-out because the collection reads through it.
- **Keys and refresh.** `ADMIN_RESOURCE_KEYS` held only `registrations` once organizations
  left it, so it is removed together with `ADMIN_ONLY_RESOURCE_KEYS`,
  `shouldRefetchAdminResourceQuery` and the `includeAdminOnly` option: `loadData`
  now refetches every collection, registrations included
  (`refetchAdminRegistrations`, skipped while the dashboard is hidden or signed
  out, because a refetch ignores `enabled`), through its own helper, and no
  `queryClient.refetchQueries` predicate remains. `loadData` refetches the organizations
  through `refetchAdminOrganizations`. The
  dashboard's organizations error comes from the collection's `lastError` like the
  others. The `ContentSection` list and `EditionModal`'s organization picker keep
  their own queries (`contentManagement.section`, `editionModalOrganizations`); they
  are separate reads of the same endpoint, not a second copy the dashboard patches.
- **No live events.** The stream carries no topic for organizations.
- Retry-safety decisions are in `docs/retry-safety.md`. Tests:
  `tests/state/adminOrganizationsCollection.test.ts`,
  `tests/hooks/useAdminSignOutCache.test.tsx`,
  `tests/hooks/useAdminPeopleActions.test.tsx`,
  `tests/components/admin.ContentManagement.test.tsx`.

## Shared collection factory and remaining resources ([#1166](https://github.com/tjorim/champagnefestival/issues/1166))

### Shared collection factory

`frontend/src/state/adminCollectionFactory.ts` holds the lifecycle that the
registrations, tables and people collections each used to copy. A collection
module is now mostly its data handling.

- `createAdminCollection<TRow, TKey>(config)` wraps `createCollection` and
  `queryCollectionOptions` with the shared settings (60 second `staleTime`,
  `retry: false`) and a **selectable sync mode**: `syncMode: "eager"` (default;
  one full load, used by every admin collection today) or `"on-demand"` (rows
  loaded for the queries that ask for them; the `queryFn` then reads the subset
  from `context.meta.loadSubsetOptions`). Every `createAdmin…Collection` accepts
  an optional `syncMode` and passes it through. The #1175 spike decided that no
  collection uses `"on-demand"` (see the
  [server-driven tables decision](#server-driven-tables-query-with-keeppreviousdata-not-on-demand-sync-1175)),
  so the option stays available but unused. Row keys may be strings or numbers (organizations are keyed by number).
  Write handlers (`onUpdate`/`onDelete`) pass straight through.
- `createAdminCollectionLifecycle({ queryKey })` returns, per collection
  module: `register` (live-event registry, advances the fence), `reset`
  (sign-out: advances the fence, empties the collection), `captureFence` (taken
  before a request, checked before every post-await write), `refetch`,
  presence-guarded writes (`deleteIfPresent`, `upsertIfPresent`), `writeToActive`
  (write to every registered collection, rejecting after all settled),
  `hasQueryKey` (live-envelope key match), and `claimEvent`/`isLatestEvent`
  (drop out-of-order live events per row id).
- Registrations, tables, the venue group and organizations use it and keep their
  public exports (`registerAdmin…Collection`, `resetAdmin…Collection`,
  `captureAdmin…Fence`, `refetchAdmin…`). People uses Query session fencing
  instead; its former collection integration was retired in #1181.
- Tests: `tests/state/adminCollectionFactory.test.ts`.

### Sign-out safety for the plain queries

The venue group and organizations now use fenced collection writes
([#1183](#venues-rooms-table-types-layouts-and-areas-1183),
[#1184](#organizations-1184)). Their earlier empty-cache guards are historical;
the current collection lifecycle rejects writes after a session change.
People and registration list pages remain plain queries: authentication gates,
query removal and session fencing prevent late responses or mutation callbacks
from repopulating a signed-out session. See the
[people Query contract](../people-query-layer.md) and
[registration scope](#registration-scope-and-shared-table-1182-2026-10-07).

### Remaining resources (#1166)

These bounded resources completed their migrations in #1183/#1184. People and
registration list pages use Query under the separate #1175 decision.

| Resource | Decision | Reason and approach | Issue |
| --- | --- | --- | --- |
| Venues, rooms, layouts, areas, table types | **Completed**, one collection per resource | Small, bounded sets loaded eagerly; shared fenced writes handle venue/layout delete cascades and revision restores. See [implementation](#venues-rooms-table-types-layouts-and-areas-1183). | [#1183](https://github.com/tjorim/champagnefestival/issues/1183) |
| Organizations | **Completed** | Eager collection with numeric keys; fenced writes and server reconciliation replace contact/dashboard cache patches. See [implementation](#organizations-1184). | [#1184](https://github.com/tjorim/champagnefestival/issues/1184) |

The migrations removed the former standalone resource caches. Collection writes
capture a fence before the request and check it before every post-await write;
their retry policies remain documented in
[retry safety](../retry-safety.md).

## Server-driven tables: Query with `keepPreviousData`, not on-demand sync ([#1175](https://github.com/tjorim/champagnefestival/issues/1175))

**Decision (2026-10-05): server-driven admin tables load each page with TanStack
Query (`placeholderData: keepPreviousData`), not with `syncMode: "on-demand"`.**
Collections stay what they are: complete, bounded sets of one resource, loaded
eagerly. A table page is a view of a server query, not an entity set, so it
lives in the Query cache keyed by the table state.

Proof: `frontend/tests/spikes/membersListOnDemand.spike.test.tsx` runs the
Members list (page, sort, search, filter, cancellation, sign-out, optimistic
edit) both ways against one fake paged server on the installed
`@tanstack/db` 0.11.3, `@tanstack/query-db-collection` 1.3.4 and
`@tanstack/react-query` 5.104. The assertions pin the observations below; a
version bump that changes one is a prompt to re-read this decision.

### Does on-demand sync work, and what can it express?

It works, and it is the wrong fit for our list contract.

| Finding (observed) | Consequence |
| --- | --- |
| `orderBy`, `limit`, `where` reach the `queryFn` through `ctx.meta.loadSubsetOptions`, and a filter change aborts the superseded request (`ctx.signal` and `loadSubsetOptions.signal`). | Works, but Query gives the same cancellation through `signal` with no collection code. |
| **`offset` is not pushed down.** A live query with `limit(5).offset(10)` calls the `queryFn` with `limit: 15` and no `offset`. | Page N loads N pages from the top. The backend contract is `page` and `limit`; deep pages over-fetch and the page boundary cannot be sent. |
| Every window also issues a **tie-break request** with no limit and no sort, filtered to `eq(sortField, boundaryValue)`. | Two requests per page, and the backend must serve arbitrary equality filters on every sortable column. |
| `parseLoadSubsetOptions` expresses and-ed `eq`/`gt`/`gte`/`lt`/`lte`/`in`, their `not_` forms and `isNull`. It **throws** on `or`, `like` and `ilike`, and its result has no `offset`. | Unsupported predicates fail loudly: the live query reports `isError`, `collection.utils.lastError` is set and no rows load. This meets the "never silently load an unfiltered list" requirement. |
| The pushed-down `where` is **re-evaluated on the client** against the loaded rows. A row the server returned because its phone number matched is dropped by a live query that can only push `ilike(name, ...)`. | The people search spans name, email, phone, address, NISS, eID, club, notes and roles with `OR`. A live query cannot express it, so the server's search semantics cannot be reproduced. This alone rules out on-demand for search. |
| A page change has **no previous data**: `isLoading` is true and `data` is `[]` until the next window arrives. | The "keep the previous page visible" requirement in #1180 would need extra code on top of the live query. |
| There is **no channel for the total**. | `rowCount` needs a second query, so Query is needed next to the collection anyway. |

### Write interplay, sign-out and live events on a partial cache

- **Direct writes refetch active subsets.** `writeUpsert` triggers a refetch of
  every active subset query and the server result replaces the written row
  (verified: a local rename is overwritten by the refetch). The write is only a
  momentary overlay, so the #1164 approach (apply the server's response, then
  refetch) gains nothing from the collection in on-demand mode.
- **The shared reset does not empty an on-demand collection.**
  `createAdminCollectionLifecycle().reset` deletes every key in a `writeBatch`;
  on an on-demand collection the rows stay (verified: size 5 before and after).
  Sign-out needs `queryClient.removeQueries({ queryKey })` followed by
  `collection.cleanup()`, after which a new mount loads again. Adopting
  on-demand would mean a second reset path in the factory.
- **Subset keys do not match the collection key.** Each subset is cached under
  `[...queryKey, <demand key string>]`, so `hasQueryKey` (exact match) never
  matches a live envelope and the per-id timestamp guard has nothing to guard.
  The key also nests under `["admin", "people"]`, where the per-person queries
  and `invalidateAdminPersonDetailQueries` already live.
- **An edited row that leaves the filter** stays in the window until the refetch
  settles, then drops out and the next row fills the page. The page is never
  short, but only because the server answered; nothing is saved by the
  collection.

### The fallback, measured the same way

| Concern | Query with `keepPreviousData` (verified) |
| --- | --- |
| Code size | One `useQuery` per table (about 15 lines with the key and the `queryFn`), no filter parser, no tie-break handling, no window arithmetic. |
| Page, sort, search, filter | All server-side; the key holds the table state; `total` arrives in the same response, so `rowCount` needs no second request. |
| Previous page | Stays visible with `isPlaceholderData` while the next loads. |
| Cancellation | `signal` aborts the superseded request when the key changes. |
| Sign-out | `removeQueries` on the list prefix drops cached pages and aborts an in-flight request; no response writes into the next session. This is the call `useAdminQueries` already makes. |
| Optimistic edit and delete | Patch the cached pages with `setQueriesData`, keep the snapshot, restore it when the write is refused, then invalidate the list prefix. A row leaving a filter is removed from the page and the refetch fills it. |
| Cache sharing between screens | A page is keyed by its table state, so two screens share a page only when their states are equal. That is acceptable: screens do not share pages; they share entities through the collections that need them (see below). |

`RegistrationList` already works this way: the page comes from a Query
(`registrationsPage`) and the shared collection only overlays fresh rows. The
decision extends that pattern to people instead of introducing a second one.

### Consequences for the rules above

- Rule 2 avoids duplicate complete entity sets. A server-driven page is a query result, so
  it is a plain query. The people list is now served entirely by Query pages
  after #1181. Registrations intentionally have both a complete active-edition
  collection for working-set consumers and separate server pages for the list;
  live events and mutations reconcile or invalidate each path.
- The `syncMode` option in `createAdminCollection` stays: it costs nothing and
  documents the choice, but nothing is planned to use `"on-demand"`. Do not
  retrofit people through it (the #1166 note anticipating that is superseded).
- The #1179 handlers use mutation callbacks with the cache patch and rollback
  above, not `onUpdate`/`onDelete` collection handlers. The retry-safety
  decision per write is unchanged: a mutation callback does not make a write
  retry safe either.
- Live events on a list invalidate the list prefix (the affected pages refetch
  only if mounted); a row patch is not needed, and the per-id ordering guard is
  not needed for an invalidation because the refetch returns current data.
- Give the list queries their own prefix (for example
  `["admin", "people", "list", params]`) so that `invalidateAdminPersonDetailQueries`
  and the live-event matching can target pages and single people separately.

### Data scope

**Registrations collection: scope it to the active edition.** It stays an eager,
complete collection, now of one edition's registrations (the list endpoint
already filters by `edition_id`), keyed by edition so a change of active edition
swaps it. Everything that needs the full working set is edition-bound:

- Dashboard aggregates (`activeEditionStats`) already count only the active
  edition. Cross-edition numbers come from `GET /api/editions/stats`.
- The layout editor's day options already come from the active edition's
  events; the floor plan, table occupancy and the volunteer check-in flow are
  confirmed against the active edition in #1182. The layout editor also opens
  historical layouts: it loads only the selected historical event on demand,
  derives occupancy from that event, and waits for the load before enabling edits.
- The registration list pages from the server (#1087 holds); its overlay falls
  back to the page's own row when the collection does not hold it (an older
  edition). The fallback is covered by the #1182 pagination tests.
- The former browser `registrationCountByPersonId` aggregate was removed:
  the people list returns the count per person (#1177).

If there is no active edition the collection is empty. A registration from an
older edition is opened by id (`fetchRegistration`).

**Former consumers of the full people list**, now using bounded or server queries (#1181):

| Consumer | Decision |
| --- | --- |
| Members, Volunteers, People tables | Server pages with the role, active and search filters (#1181). |
| Tab and filter counts, `peopleCount` badge | Counts from the list envelope or counts endpoint (#1177). |
| Registration count per person | A field on the list row, sortable (#1177). |
| Registration detail: duplicate emails | Server lookup by email, enabled only while the detail is open (#1177). |
| Person pickers (registration, item modal, organization contact) | Bounded server search (short page); the item modal already does this. |
| Merge | Picker over the bounded search; after the merge invalidate the people list prefix and refetch the registrations and organizations collections. |

Screen loading never keeps the whole people list in the browser. Explicit
copy-matching-emails actions read bounded pages only on request. The people
collection (`adminPeopleCollection.ts`, #1164) was retired in #1181, together with
`selectMembers`/`selectVolunteers` and the person direct-write helpers.

### Hand-over to #1168 (persistence)

- **Stay full-load, persistable as complete sets:** tables, venues, rooms, table
  types, layouts, areas, organizations, and the registrations of the active edition
  (persisted under the edition key).
- **Never persisted:** people pages and the registration list pages. They are
  Query results, partial by construction, and hold personal data; a persisted
  partial page must not be mistaken for a complete set.
- **Partial collection subsets:** none. No collection uses on-demand sync.
- **Outcome (2026-10-06):** a narrow, read-only warm start through the Query cache
  (phase 1 without guest data, phase 2 registrations once the privacy conditions are
  met); TanStack's SQLite persistence is deferred; see
  [1168-persisted-collections.md](1168-persisted-collections.md).

### Dependent issues

#1174, #1176, #1177, #1178, #1179, #1180, #1181, #1182 and #1168 were updated to match
(issue bodies, not comments).

## Rules that still apply

These come from #442 and apply to every further migration:

1. **Do not add TanStack DB unless it reduces real complexity, or the
   migration is needed to keep the admin state pattern consistent.** Each
   migration should remove more patching code than it adds. The bounded resource
   migrations from #1166 are complete; server-driven list pages follow #1175
   instead. The collections' pre-1.0 status is an accepted risk.
2. **Avoid duplicate complete entity sets.** Bounded resources use collections
   refetched through their `refetch…` helpers. Server-driven pages use Query;
   registrations have both active-edition working-set and list-page consumers,
   with shared mutation/live-event reconciliation as described above.
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
  resolves once the write is applied (1.3.2). Registration live-event patching
  awaits these receipts through the shared lifecycle; #1167 completed this work.
- `tx.when('settled')` and `$hasPendingWrites` (`@tanstack/db` 0.11.1) can confirm
  a server response and show pending state.
- Rows returned from a live query are the source collection's row objects, not
  copies. Do not mutate them.

## Paged list contract for people and volunteers ([#1176](https://github.com/tjorim/champagnefestival/issues/1176))

**Decision (2026-10-05): `GET /api/people` and `GET /api/volunteers` take one
shared contract (`ListQuery`: `q`, `page`, `limit`, `sort_dir`, plus a per-endpoint
`sort` whitelist) and answer `{items, total, limit, page}`.** The parameter
reference lives in `backend/README.md` ("Paged list contract"); the choices:

- **Volunteers keep their own path.** Folding them into `/api/people` would force
  every reader of the embedded help periods (and the MCP tools and the volunteer
  mutations that return `VolunteerOut`) onto a heavier or different response, for
  no gain: the endpoint is already a role-restricted view of the same rows. Instead
  both endpoints go through `app/services/people_listing.py`, so they cannot drift
  again.
- **One `q`.** The people semantics (name, e-mail, phone, address, NISS, eID, club,
  notes, roles, with fuzzy name/e-mail matching) is the superset the tables rely
  on, so volunteers adopt it. The volunteer search used to cover only name,
  address, NISS and eID, and the MCP member search only name, e-mail, phone,
  address, club and notes; both now use the shared filter. Members and visitors
  are people with a role, read with `GET /api/people?role=…`, and need no
  endpoint of their own.
- **One default, never unbounded.** `limit` defaults to 50 (the registrations
  default) with a 1000 maximum, and `page` no longer requires `limit`. People and
  volunteers used to default to 200, and `Pagination` (still used by the audit,
  organization and ledger endpoints) returns every row when `limit` is omitted.
- **Total orders.** Every sort ends in `id` in the same direction, `name`/`email`
  sort on the normalised `search_*` columns, and each sortable column has a
  composite btree ending in `id` (migration `003`). Offset paging stays; keyset
  paging is not needed at the expected scale.
- **Unknown sort keys are a 422.** They are `Literal` enums, so the OpenAPI schema
  lists the allowed values for the table to read.

## Roadmap

The server-driven tables epic [#1174](https://github.com/tjorim/champagnefestival/issues/1174)
is complete as of 2026-10-07. All eight sub-issues (#1175–#1182) are closed:
the spike selected Query pages, the backend supplies full-result sorting,
filtering, counts and exports, and Members, Volunteers, People and registrations
render through `AdminDataTable`. People pages use optimistic mutation callbacks;
the registrations collection is complete only within the active edition.
See the implementation records below and the [shared table contract](../admin-data-table.md).

The preceding collection work is also complete: #1164 (initial people collection,
retired by #1181), #1166 (shared factory and resource decisions), #1165 (tables and
occupancy), #1167 (write receipts), #1183 (venue group), #1184 (organizations) and
#1169 (this record).

Persistence was decided in [#1168](https://github.com/tjorim/champagnefestival/issues/1168).
Its separate implementation is tracked by [#1197](https://github.com/tjorim/champagnefestival/issues/1197),
subject to the [privacy and validation gates](1168-persisted-collections.md).
It is outside #1174; list pages must never be persisted.

## References

- TanStack DB: <https://tanstack.com/db>
- Related issue [#441](https://github.com/tjorim/champagnefestival/issues/441):
  TanStack Router/Query architecture standardization
- Live-update stream: [#446](https://github.com/tjorim/champagnefestival/issues/446)
- `frontend/src/state/adminRegistrationsCollection.ts`
- `frontend/src/state/adminTablesCollection.ts`, `frontend/src/state/tableOccupancy.ts`
- `frontend/src/state/adminPeopleSession.ts`, `frontend/src/utils/optimisticPeoplePages.ts`
- `frontend/src/state/adminVenueCollections.ts`
- `frontend/src/state/adminCollectionFactory.ts`
- `frontend/src/hooks/useAdminQueries.ts`
- `frontend/src/state/LiveUpdatesProvider.tsx`
- `frontend/src/hooks/useAdminRegistrationActions.ts`: current registration write
  patches

### People Query layer implementation (#1178, 2026-10-06)

The reusable page and counts hooks are implemented; see
[contract and migration handoff](../people-query-layer.md). The eager collection
and full-list consumers were retired together with #1179/#1181 on 2026-10-06.
See [the implementation](../people-query-layer.md) for the table adapters,
optimistic concurrency, session fencing and search reconciliation policy.

### People screens and optimistic writes (#1179/#1181, 2026-10-06)

Implemented together to avoid a dependency cycle between Query mutations and
screen adoption. All three screens use `AdminDataTable`, server pages, filters,
sorting and full-result facets. The people collection and local selectors are
retired. Saved column visibility retains its existing keys and ids; unsupported
sorts are disabled. Exports stream the complete filtered result. Exact duplicate
email lookup replaces full-list scans in people rows and registration details,
and uses server registration counts to choose a merge survivor.

Mutation callbacks cancel lists, snapshot and patch cached pages, refetch before
rollback, and invalidate lists/counts/person details on settlement. A shared
coordinator reapplies other pending writes during refetch and serializes writes
for one person. Query-instance identity and an authentication epoch prevent a
late callback from writing into a replacement session. Pending state is shown
on rows and in the existing forms/delete dialogs. Creates remain non-optimistic;
merge remains direct and reconciles the registrations/organizations collections.
Search membership and ordering remain server-owned because fuzzy matching
cannot be reproduced faithfully in the browser. Role and active-filter exits
are optimistic. [Retry safety](../retry-safety.md) is unchanged in substance.

### Registration scope and shared table (#1182, 2026-10-07)

The registrations collection eagerly reads all pages **of the active edition only**.
Its key is `["admin", "registrations", "edition", editionId]`; without an edition,
it returns an empty set and makes no registrations request. Collection keys have
zero cache retention after their observers leave. The lifecycle still matches
server envelopes carrying the registrations prefix; fetched live rows enter only
collections of their own edition. A row moved out of the edition is removed.
Timestamp ordering, session fences, deletion and sign-out reset remain in place.

`useRegistrationListQuery` owns the server page, previous-page retention, request
cancellation and totals. `RegistrationList` uses `AdminDataTable`'s controlled
renderer and the same manual sorting/filtering/pagination pattern as people,
while retaining its specialised status/edition/date controls, selection, bulk
progress, exports and column visibility. The controlled renderer is also used
by the full shared table. Historical rows fall back to the server page; detail,
payment and table-assignment lookups fetch by id when absent from the collection.
Person edits refresh an open historical registration by id rather than closing it.

Dashboard `activeEditionStats` stays derived from the complete active edition.
Cross-edition attendance/financial figures remain server-owned (`GET /api/editions/stats`).
List status/category/date facets and the sidebar badge use the existing paged
endpoint's server total with `limit=1` per facet, never a full registration load; registration
live events, reconnects and mutations refresh them. Organization contact filters use the organization contacts directly (an empty result
is allowed), rather than intersecting with only the active bookings. Person counts remain fields
of server people pages. Patched live events also invalidate registration pages,
check-in statistics (now carrying event titles, including historical events), count facets and historical floor-plan event queries.

The editor's historical event query never enters the collection and has zero
cache retention after unmount or selection change. Loading/error states block
editing until occupancy is known. Operational seating and the dashboard use the
active collection; check-in detail/search and the visitor venue plan use their
existing server queries. No historical collection or unbounded background read
is introduced. Explicit select-all/export remains an on-demand full matching read.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` and
all 935 frontend tests passed (four test workers). Backend Ruff, formatting,
`ty`, migrations and schema drift checks passed; all 1373 backend tests passed,
with the seven event endpoint tests rerun after adding the title field. All 275
e2e checks passed across the full run and rerun of three page-loading timeouts.
The two full-matching UI tests retain their assertions with a 30-second timeout
for rendering and bulk progress on a busy machine.


## Read-only Query warm start (#1197, 2026-10-07)

The installed adapter mirrors manual upserts/deletes into Query and initializes
an eager collection from hydrated data before a pending network response. Failed
refetches retain that baseline, verified with the real adapter in
`adminWarmStart.verify.test.ts`. No extra collection initializer is necessary.
The dashboard does need to bypass its global loading skeleton when cache restore
succeeded, because unrelated live page/count queries can still be pending.

The app-level session owner restores only whole allowlisted keys through an
IndexedDB async persister, with 72-hour Query GC/retention, a row-shape buster,
active-edition isolation, sensitive-field removal and epoch-fenced writes/restore.
Collections always reconcile on mount. Saved-row and oldest-sync state is visible;
all write handlers and retry policies remain unchanged. See
[verification, measurements and remaining release conditions](1168-persisted-collections.md#implementation-verification-1197-2026-10-07).
