# TanStack DB for admin/event-day operational state

**Status:** Adopted for the registrations pilot; other resources are open follow-ups (see [Roadmap](#roadmap))
**Adopted:** 2026-05-27, [#442](https://github.com/tjorim/champagnefestival/issues/442) (closed as "adopt, not defer"), pilot merged in [#455](https://github.com/tjorim/champagnefestival/pull/455)
**Record updated:** 2026-10-05, [#1169](https://github.com/tjorim/champagnefestival/issues/1169)

---

## Context

The admin and event-day screens load ten related resources (registrations, tables,
venues, rooms, table types, layouts, exhibitors, areas, people, members). Writes
used to patch each affected TanStack Query cache by hand with `setQueryData`, and
one user action could touch up to four caches (a person update reaches `members`,
`registrations` and `exhibitors`; a table assignment reaches `registrations` and
`tables`). A missed patch silently leaves the UI stale.

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
collection write handlers (`onInsert`, `onUpdate`, `onDelete`) exist yet, and a
table assignment still patches the `registrations` and `tables` caches separately
until tables move to a collection ([#1165](https://github.com/tjorim/champagnefestival/issues/1165)).

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
| Migrate `tables` and derive seating occupancy from the registrations collection | [#1165](https://github.com/tjorim/champagnefestival/issues/1165) |
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
- `frontend/src/hooks/useAdminQueries.ts`
- `frontend/src/state/LiveUpdatesProvider.tsx`
- `frontend/src/hooks/useAdminRegistrationActions.ts`: current registration write
  patches
