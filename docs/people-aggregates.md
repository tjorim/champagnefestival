# People aggregates and exports (#1177)

The paged contract from #1176 remains `{items, total, page, limit}`. Each people
item additionally contains `registration_count`, covering all registrations for
that person, including cancelled bookings and all editions. It can be sorted
with `sort=registration_count`; count and person ID use the requested direction.

`GET /api/people/counts` returns `{total, active, inactive, by_role}` across the
intersection of `q`, `role` and `active`. It never derives counts from a page.
Roles are lower-cased, overlap, and count each person once per role. Omit the
facet's own filter when requesting counts for its alternative tabs. For volunteer
counts use `role=volunteer`. Dashboard totals can use this endpoint or the
unfiltered people envelope with `limit=1`.

`GET /api/people/by-email?email=...&exclude_person_id=...` provides an exact,
case-insensitive lookup over the indexed `search_email`, including inactive
people. It uses the bounded list envelope and stable ID ordering; consumers
must respect `total` and page if necessary. An empty email is rejected. It does
not use fuzzy search. This replaced the full-list registration-detail scan in
#1181; people rows and merge actions also use this lookup.

`GET /api/people/export` uses the shared `q`, `role`, `active`, `sort` and
`sort_dir` contract. `GET /api/volunteers/export` uses the same contract with
`role=volunteer` implied and the volunteer sort whitelist. Pagination does not
truncate either export. The insurance export retains its active-only default;
`include_inactive=true` removes it and explicit `active` wins. The insurance
columns and one-row-per-period shape are preserved. People exports contain
contact fields, roles, active status and registration count, excluding NISS/eID.
Every CSV cell uses the shared formula guard. Both exports fetch via a database
cursor in batches of 250, loading help periods for only the current batch, and
close the cursor even if response streaming is cancelled. The request-scoped
session remains open for the response. All these reads require the admin role.
No write operation or automatic retry is introduced.

## Sorting cost

The registration aggregate probes the existing `ix_registrations_person_id`
btree, without a stored counter or additional write maintenance. Sorting by the
aggregate evaluates every matching person's count and sorts with an ID tiebreak;
it cannot use a btree on the derived count itself.

On 2026-10-06, a local PostgreSQL 18.4 synthetic `EXPLAIN (ANALYZE, BUFFERS)`
check used 10,000 people and 100,000 registrations (10 per person), requested
50 rows ordered by count descending then ID descending, and reported **334.456
ms** execution time including initial JIT overhead. The plan used 10,000 bitmap
index scans on `ix_registrations_person_id` and a 28 kB top-N heapsort. This is a
synthetic headroom check, not a production latency guarantee: narrow temporary
tables, cached local buffers, and uniform registration distribution do not model
all production conditions. Reassess using production-shaped data if the dataset
grows materially beyond this scale.

Integration tests cover counts under combined filters, role overlap, paged exact
email lookup, cancelled registrations, count ties in both sort directions,
exports across forced small cursor batches, pagination independence, volunteer
period rows, formula safety and authorization. Frontend integration completed in #1181; see the [people Query contract](people-query-layer.md).

## Acceptance and verification

- [x] Full-set counts, registration counts and exact duplicate-email lookup work independently of page size.
- [x] Exports stream the full filtered set with bounded fetching.
- [x] Registration-count sorting is deterministic, uses indexed lookups and has a documented scale check.
- [x] Backend lint, formatting, typechecking and tests pass.

Verification on 2026-10-06: 77 targeted tests passed; the full suite had 1,354
passes and 19 worker tests initially failing because the application database URL
used local default credentials. All 19 passed when rerun with `DATABASE_URL`
pointing at the same isolated test database as `TEST_DATABASE_URL` (1,373 tests
passed across the full run and corrected rerun). Ruff lint/format and ty passed.
