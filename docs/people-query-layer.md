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
well. There is no partial-cache row patch or timestamp ordering requirement.
The backend currently does not emit a people topic; this handles people keys
when delivered and reconnect recovery, without introducing a new SSE contract.

The Query signal reaches fetch. Changing the key aborts an unused request;
removing the people prefix on sign-out (already in `useAdminQueries`) aborts
in-flight queries and removes cached pages. A late response cannot populate
the next session. Shared observers of the same key intentionally keep their
request alive until its final observer leaves.

The existing eager people collection and screen consumers remain temporarily
for #1181, as required by the revised issue and spike decision. That migration
must replace local selectors, duplicate-email scans, merge/pickers and local
registration counts with the server contracts in the decision's data scope
table before removing the collection. This change adds no write operation.

Tests exercise page/filter/sort mapping, previous-page placeholders, server
registration counts, bounded volunteer details, cancellation, late responses,
sign-out reset, full-set counts and live/reconnect refetch of a mounted page.

Verification on 2026-10-06: typecheck, lint (existing warnings only), formatting
and all 939 tests passed (`pnpm test --maxWorkers=4`). The default-worker full
run passed 938 tests with one bulk-selection timeout; that test passed in
isolation and in the four-worker full run. Run typecheck and tests sequentially:
both generate Paraglide output and concurrent generation can change the locale
strategy underneath tests.
