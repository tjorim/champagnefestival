# People query layer (#1178)

The reusable `usePeopleListQuery` hook takes the server contract verbatim:
`page`, `limit`, `q`, `sort`, `sort_dir`, `role`, `active`. It returns a Query
result whose `data` is `{items, total, page, limit}`; tables use `total` as
`rowCount` and `isPlaceholderData` while the previous page remains visible.
Members use `role=member`; volunteers use `role=volunteer`, which selects the
bounded `/api/volunteers` endpoint including help periods. Volunteer sorting
supports name, created and updated; unsupported sorts and extra predicates
throw rather than silently filtering or sorting a partial page.
People rows expose the server's all-edition `registrationCount`; volunteer
rows leave that field undefined because their endpoint does not provide it.

`usePeopleCountsQuery` reads full-set facets from `/api/people/counts`. Omit a
facet's own filter when requesting alternative tab counts. Both hooks take
an `enabled` flag for authentication/permission gating and hide data when it
is false. Neither page results nor counts are persisted.

Keys are `["admin", "people", "list", params]` and
`["admin", "people", "counts", params]`. The list prefix can be invalidated
without touching person-detail queries. People live invalidations use the
existing generic prefix invalidation; reconnect now invalidates people as
well. Live updates need no partial-cache row patch or timestamp ordering guard;
mutation callbacks below maintain their own optimistic snapshots.
The backend currently does not emit a people topic; this handles people keys
when delivered and reconnect recovery, without introducing a new SSE contract.

The Query signal reaches fetch. Changing the key aborts an unused request;
removing the people prefix on sign-out (already in `useAdminQueries`) aborts
in-flight queries and removes cached pages. A late response cannot populate
the next session. Shared observers of the same key intentionally keep their
request alive until its final observer leaves.

The three screens now use `PeopleDataTable` over `AdminDataTable` (#1179/#1181).
The eager people collection, its direct-write helpers, the member/volunteer
selectors and exhaustive people fetch functions are retired. Dashboard badges
read full-set counts; registration details and merge actions use bounded exact
email lookup (including inactive matches), with registration counts from each
server row. Existing bounded person pickers need no full-list props.

`PeopleDataTable` maps the existing `registrations` column id to the server's
`registration_count` sort, preserving saved visibility keys and column ids.
Active-filter counts omit active; role-filter counts omit role. Unsupported
column sorts are disabled. Unknown URL sort ids fall back to default ordering;
volunteer list reads and exports discard email/registration-count sorts
unsupported by their endpoints. People/member reads and exports retain those sorts. Exports send all current filters and ordering to
the streaming server endpoint, without page or limit. Volunteer exports explicitly
set `include_inactive=true` so an unfiltered export includes the same full set
as the table; an explicit active filter still takes precedence. Copying matching emails
is an explicit action that reads bounded pages and checks the session between
requests; screen loading never reads the whole list.

Edits/deletes apply through `usePeopleMutations` callbacks and the shared
`optimisticPeoplePages` coordinator. The coordinator keeps server snapshots,
reapplies other pending writes when any page refetches, serializes persistence
for the same person, and only touches the original Query instance. Role/active
changes remove rows that leave a cached filter and lower totals on every
cached page of that result. Search uses server fuzzy matching: optimistic edits
keep the existing search membership until reconciliation rather than falsely
applying a browser substring predicate. Refetches refill and reorder pages;
failed reconciliation rolls back to snapshots. Pending row spinners use
`useIsMutating`; form/delete errors remain in their existing modals. Creates
stay non-optimistic and merge remains a direct action. Registration copies are
refetched through their collection, and exhibitor contacts are reconciled on
merge. Every asynchronous callback checks the session fence.

Tests exercise page/filter/sort mapping, previous-page placeholders, server
registration counts, bounded volunteer details, cancellation, late responses,
sign-out reset, full-set counts and live/reconnect refetch of a mounted page.

Initial #1178 verification on 2026-10-06: typecheck, lint (existing warnings only), formatting
and all 939 tests passed (`pnpm test --maxWorkers=4`). The default-worker full
run passed 938 tests with one bulk-selection timeout; that test passed in
isolation and in the four-worker full run. Run typecheck and tests sequentially:
both generate Paraglide output and concurrent generation can change the locale
strategy underneath tests.


Acceptance criteria for #1179/#1181:

- [x] All three screens use bounded server pages, full-set facets and server sorting/search.
- [x] Forms, delete errors, merges, email actions, payment views and saved column ids remain available.
- [x] Exports cover the full filtered set; duplicate lookup and dashboard counts no longer need an eager people list.
- [x] Edits/deletes are optimistic, coordinate overlapping writes and reconcile from the server before rollback.
- [x] Late callbacks and queued writes cannot repopulate or mutate a replacement session.
- [x] Creates and merges stay non-optimistic; retry safety is documented and no write retries are enabled.
- [x] Screen, mutation and authenticated browser regression tests cover the migration.


Combined #1179/#1181 verification on 2026-10-06: typecheck, lint (existing
warnings only), formatting and all 923 unit tests across 124 files pass. The
complete 275-case Chromium suite passed 269 initially; five public-page
navigation/timeouts passed on a serial rerun. The remaining legacy people-table
test was updated for the required mobile cards and passes, together with all
three new authenticated people-screen flows (six cases including setup and the
shared-table test). Production build passes. No backend code changed.
