# TanStack DB evaluation for admin/event-day operational state

**Status:** Deferred — revisit when TanStack DB reaches a stable release (≥ 1.0)
**Date:** 2026-05-26
**Issue:** [#442](https://github.com/tjorim/champagnefestival/issues/442)

---

## Context

Champagne Festival's frontend already uses TanStack Query, Form, Router, and Table.
TanStack DB (`@tanstack/db` + `@tanstack/react-db`) is a new reactive client-side
collection store that complements TanStack Query for highly interactive, relational
domains. The issue asks us to evaluate whether it would reduce complexity in the
admin/event-day operational workflows.

---

## Current architecture

Admin state is fetched and cached through `useAdminQueries`
(`frontend/src/hooks/useAdminQueries.ts`), which wires ten independent `useQuery`
calls — one per resource: registrations, tables, venues, rooms, table types,
layouts, exhibitors, areas, people, and members.

Mutations live in `AdminDashboard` and use `useMutation` from TanStack Query.
After each mutation succeeds, the code manually updates the relevant cache entries
with `queryClient.setQueryData`. Because resources are related — a table assignment
touches both `registrations` and `tables` — several mutations must call
`setQueryData` on two separate caches:

```ts
// handleAssignTable in AdminDashboard.tsx (abridged)
queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
  prev?.map((r) => r.id === registrationId ? { ...r, tableId: updated.tableId } : r),
);
queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
  prev?.map((t) => {
    // remove from old table, add to new table
    ...
  }),
);
```

`AdminDashboard.tsx` currently contains **40+ `setQueryData` calls** across
table placement, area management, people/member CRUD, registration status, payment
status, check-in, and bottle-delivery updates.

---

## Candidate domains for TanStack DB

| Domain | Why it's a candidate | Current pain |
|---|---|---|
| Registrations + check-in state | Mutated frequently; check-in updates should propagate to all views | Dual `setQueryData` for registration + table on every table assignment |
| Tables / seating | Occupancy is derived from registrations; table updates affect layout views | Same dual-update problem |
| People / members | Related: updating a person must sync to `members`, `registrations`, and `exhibitors` | Up to 4 separate `setQueryData` calls per person update |
| Check-in / strap state | Event-day operational; high update rate expected | Single-cache but high-frequency |

---

## What TanStack DB offers

`@tanstack/db` (v0.6.7 as of this evaluation) provides:

- **`createCollection`** — a typed in-memory store keyed by entity id, populated
  from any async source (a `queryFn`, a WebSocket, Server-Sent Events, etc.)
- **`useCollectionQuery`** / **`useCollectionCount`** — reactive hooks that
  subscribe to collection changes and re-render only the affected components
- **Built-in optimistic mutations** — the library owns the write path so rollback
  on error is automatic
- **No deduplication headaches** — there is one authoritative copy of each entity;
  derived views query the collection rather than a per-view cache slice

For a domain like "registration + table assignment", TanStack DB would replace the
dual `setQueryData` dance with a single collection update:

```ts
// hypothetical with TanStack DB
collection.mutate(registrationId, (draft) => {
  draft.tableId = newTableId;
});
// The tables view re-derives occupancy from the same collection automatically
```

---

## Evaluation against project rules

> **Rule:** Do not add TanStack DB unless it reduces real complexity.

### Does it reduce real complexity?

**Yes — materially.** The 40+ manual `setQueryData` calls are the main complexity
driver. Several mutations update 2–4 separate caches to keep related resources in
sync; any missed update silently leaves the UI stale. A single authoritative
collection would eliminate this class of bug and remove ~200 lines of boilerplate
from `AdminDashboard`.

However, the *existing* complexity can also be partially addressed by replacing
`setQueryData` with `queryClient.invalidateQueries` for the few domains (like
people/members) where cross-cache sync is needed. That is a lower-risk option that
does not require adopting a new library.

### Other rules

> Do not duplicate a Query collection and standalone `useQuery` for the same domain.

This is the key constraint. Mixing TanStack DB collections and `useQuery` for the
same resource (e.g., a `registrations` collection *and* a `["admin","registrations"]`
query key) would create exactly the duplication the rule forbids. Migrating to
TanStack DB would require fully replacing the corresponding `useQuery`/`setQueryData`
paths for the pilot domain.

> Keep payloads normalized enough to avoid stale duplicated resource copies.

TanStack DB's single-collection model is designed for normalization. This rule would
be *easier* to satisfy with TanStack DB than with the current multi-cache approach.

> Keep MSW handlers aligned with collection-backed tests.

The existing MSW handlers (`src/mocks/handlers/admin.ts`) already expose REST
endpoints. TanStack DB collections can be seeded from those same endpoints, so no
handler changes would be required.

---

## Recommendation: Defer

Adopt TanStack DB when the following conditions are met:

1. **Library stability** — `@tanstack/db` and `@tanstack/react-db` reach a stable
   release (≥ 1.0). As of this evaluation both packages are at pre-1.0 versions
   (0.6.7 and 0.1.85 respectively), published only days before this note was
   written. Pre-1.0 TanStack packages have historically had breaking API changes
   between minor releases.

2. **Live event streams arrive** — TanStack DB becomes most valuable when
   collections receive server-sent incremental updates (e.g., a check-in WebSocket
   event updates the local collection without a full re-fetch). There is no live
   stream infrastructure today, so the incremental-update benefit does not apply.

3. **Cross-cache sync pain grows** — If new mutation handlers continue to require
   multi-cache `setQueryData` updates, the break-even point shifts toward adoption.
   A useful threshold: if a single user action requires updating ≥ 3 separate query
   caches, that handler is a strong candidate for a collection.

Until these conditions are met, the current TanStack Query approach is sufficient.
The manual `setQueryData` calls are verbose but explicit, auditable, and type-safe.

---

## If the decision changes to "adopt"

The recommended pilot domain is **registrations + table assignment + check-in state**
because:

- It is the most update-heavy domain (status, payment, table, check-in, strap,
  bottle delivery — 6 distinct mutation targets per registration)
- Table assignment currently requires the most complex dual-cache sync
- Check-in state propagates across admin, check-in, and future event-day views

Implementation steps when adopting:

1. Install `@tanstack/react-db` and `@tanstack/db`.
2. Create a `registrationsCollection` in a new file
   `frontend/src/store/registrationsCollection.ts` using `createCollection`,
   seeded by the existing `/api/registrations` endpoint.
3. Replace the `useQuery` + `setQueryData` paths in `useAdminQueries` and
   `AdminDashboard` with `useCollectionQuery`.
4. Remove the `["admin","registrations"]` query key from `queryKeys.ts` and
   `ADMIN_RESOURCE_KEYS` in `useAdminQueries.ts`.
5. Derive table occupancy from the collection rather than from a separate
   `["admin","tables"]` cache entry (tables remain a separate query; only the
   `registrationIds` field is derived from the collection).
6. Write tests using the existing MSW handlers; seed the collection in `beforeEach`
   and call the collection's reset method in `afterEach`.

---

## References

- TanStack DB npm: <https://www.npmjs.com/package/@tanstack/db>
- TanStack React DB npm: <https://www.npmjs.com/package/@tanstack/react-db>
- Related issue [#441](https://github.com/tjorim/champagnefestival/issues/441) —
  TanStack Router/Query architecture standardization
- `frontend/src/hooks/useAdminQueries.ts` — current multi-query hook
- `frontend/src/components/admin/AdminDashboard.tsx` — current mutation +
  `setQueryData` patterns
