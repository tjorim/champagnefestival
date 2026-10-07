# Persisted TanStack DB collections for event-day admin resilience

**Status:** Adopted as a read-only warm start through the Query cache, registrations included, gated on the privacy conditions below; TanStack's SQLite persistence is deferred
**Decided:** 2026-10-06 (revised the same day: the goal is a warm start, not an offline app), [#1168](https://github.com/tjorim/champagnefestival/issues/1168)
**Depends on:** [#1175](https://github.com/tjorim/champagnefestival/issues/1175) (done; see the [hand-over](tanstack-db.md#hand-over-to-1168-persistence))

This record is desk research against the packages' published documentation and
the current code. No spike branch was built and no bundle was measured, by the
owner's choice (2026-10-06: skip the spike). The items a spike would have answered
are listed under [Unverified](#original-verification-questions-and-remaining-checks) and become the
first tasks of the implementation issue.

## Decision

**The goal is a warm start, not an offline app.** After a reload, or on a flaky
connection, the admin screens should show the last known rows while the network
answers, and the user should be able to keep reading them. Offline writes, a replay
queue and offline check-in are not goals here (web check-in stays live-only,
[#937](https://github.com/tjorim/champagnefestival/issues/937)).

- **Adopt, narrowly:** persist the TanStack Query cache entries that back the
  bounded collections, read-only, with a short `maxAge`, a `buster` and an app-level
  wipe (see [Option B](#option-b-persist-the-query-cache-chosen)). Nothing is written
  offline; every write still needs the network and the server stays authoritative.
- **Defer TanStack's SQLite persistence** ([Option A](#option-a-tanstack-sqlite-persistence-deferred)).
  It does more than a warm start needs (a WASM database, a worker, a multi-tab
  coordinator, an alpha package that needs a newer `@tanstack/db` than ours) for the
  same read-only benefit.
- **Scope: registrations from the start** (owner decision, 2026-10-06), together with
  the collections without guest data (tables, venues, rooms, table types, layouts,
  areas, organizations). The registrations of the active edition are the part with real
  benefit: someone on a bad connection can still look up who sits where and who has
  checked in, as of the last sync, with a visible "last updated" state. The others
  are small and add little alone, but they share the same plumbing. **Never**
  persisted: people pages, registration list pages, payment ledgers, `checkInToken`,
  NISS and eID.
- **Gated on privacy.** The first release that persists registrations must meet every
  [privacy condition](#privacy), which add no new public text (condition 4). The owner chose the device retention: it must
  cover the full festival weekend, set as 72 hours since the last successful write
  (see condition 3).
- **No spike first** (owner decision). The open questions in
  [Unverified](#original-verification-questions-and-remaining-checks) are answered by the
  implementation's first commits, before the persistence is wired to the dashboard,
  and a failed answer sends the work back to this record.

Implementation is a separate issue, [#1197](https://github.com/tjorim/champagnefestival/issues/1197) (this record's scope is the decision). It needs
tests for the restore, wipe, expiry and edition-change paths; because it adds no
write, `docs/retry-safety.md` needs no entry, and the issue should say so.

## Questions from the issue

### Option A: TanStack SQLite persistence (deferred)

Package, storage backend, size, CSP and workers:

- **Package.** `@tanstack/browser-db-sqlite-persistence` (0.2.x on 2026-10-06) on
  top of `@tanstack/db-sqlite-persistence-core` (0.4.x). The core release that added
  `initialRender: { strategy: 'network-first', networkTimeoutMs }` and the separate
  `persistedStatus`, `isPersistedReady` and `persistedError` is 0.4.0. It applies
  to eagerly persisted SQLite collections only, which is the only shape we would
  use. The API is `createBrowserWASQLitePersistence`,
  `openBrowserWASQLiteOPFSDatabase`, `BrowserCollectionCoordinator` and
  `persistedCollectionOptions`, which wraps the existing `queryCollectionOptions`
  config (plus a per-collection `schemaVersion`).
- **Backend.** SQLite compiled to WebAssembly (`@journeyapps/wa-sqlite`, a peer
  dependency) storing to the Origin Private File System from a dedicated Web
  Worker. There is no IndexedDB backend in the TanStack packages.
- **Maturity.** The TanStack announcement calls the 0.6 persistence layer a
  "first alpha release". Upstream issues
  [#1443](https://github.com/TanStack/db/issues/1443) (collections never reach `ready`
  with the browser coordinator and the Electric adapter) and
  [#1456](https://github.com/TanStack/db/issues/1456) (data not persisted with that
  adapter combination) were reported against it; both involve the Electric adapter, not
  `queryCollectionOptions`, but they show the layer is young. Pre-1.0 is already an accepted risk for the in-memory
  collections ([rule 1](tanstack-db.md#rules-that-still-apply)), but those do not
  hold data that outlives the session.
- **Version mismatch.** `db-sqlite-persistence-core` 0.4.4 depends on
  `@tanstack/db` 0.12.0; we run 0.11.3 (with `@tanstack/react-db` ^0.5.3 and
  `@tanstack/query-db-collection` ^1.3.4). Adoption starts with a coordinated
  upgrade of all four, re-running `tests/spikes/membersListOnDemand.spike.test.tsx`
  and the collection tests, which pin 0.11 behavior.
- **Size.** The registry reports about 2.2 MB unpacked for the browser package and
  the core package each, and 18 MB unpacked for `@journeyapps/wa-sqlite` (several
  builds). Those are package sizes, not what a visitor downloads; the transferred
  `.wasm` plus worker is **not measured**. It would be loaded only in the admin
  chunk, never for public pages.
- **Browser requirements** (package README): OPFS, Web Workers, a secure context,
  and `BroadcastChannel` plus the Web Locks API for multi-tab coordination (leader
  election, transaction fan-out, write forwarding). The README does not require
  COOP/COEP headers (whether the OPFS VFS it uses needs
  `SharedArrayBuffer` is unverified). Operational limits it lists: a 30 second
  open timeout, `pagehide` terminating the connection, a fresh connection needed
  after a back/forward-cache restore, and `PersistenceUnavailableError` where OPFS is
  missing.
- **CSP.** This repository sets no CSP or cross-origin headers; they belong to the
  Caddy stack in `/opt/apps/infra`, which this record could not inspect. If a
  policy is added there, a WASM worker needs `worker-src 'self'` and
  `script-src 'wasm-unsafe-eval'`. Verify in the spike rather than assume.

### Option B: persist the Query cache (chosen)

The collections read through TanStack Query (`queryCollectionOptions`), so the
rows already live in the Query cache under the collections' query keys. TanStack
Query's own persistence (`@tanstack/query-persist-client-core` with
`persistQueryClient`, or `PersistQueryClientProvider` in React) saves that cache
to a storage and restores it before the first render. The documented pattern for
larger data is an async persister over IndexedDB. It is a stable, long-used part of
TanStack Query v5, which we already run (`@tanstack/react-query` ^5.104).

Why it fits a warm start:

- **No WASM, no worker, no COOP/COEP or `wasm-unsafe-eval`.** IndexedDB works in the
  main thread; the CSP and size questions from Option A mostly disappear (a small
  persister and an IndexedDB helper).
- **Allowlist.** `dehydrateOptions.shouldDehydrateQuery` selects exactly the query
  keys to save, so people pages, registration list pages and payment queries are
  excluded by construction rather than by remembering to skip them. It must match
  **whole keys, not prefixes**: the registrations collection's key is
  `["admin", "registrations"]`, and the registration list pages
  (`["admin", "registrations", "page", ...]`, with names, emails and phone numbers) and
  the check-in statistics nest under that same prefix.
- **Expiry and invalidation are built in.** `maxAge` discards a restore older than the
  limit (the device retention condition), and `buster` discards it when the app's row
  shapes change (the role `schemaVersion` plays in Option A). The registrations
  query key does **not** carry the edition today; see [Dependencies](#dependencies).
- **A deletion API exists.** A persister has `removeClient`, so the sign-out wipe is a
  documented call rather than an unknown.
- **No new database state and no multi-tab coordinator.** The cache is one blob;
  the last writer wins, which is acceptable for a cache that the server overwrites on
  the next fetch.

Costs and limits:

- The whole cache is serialised on change, so only the allowlisted keys should be
  dehydrated and writes should be throttled (the persister option). Registrations are
  one list per edition, so one blob of that size is the thing to measure.
- Direct collection writes (`writeUpsert`/`writeDelete`, which the live-event patching
  uses) must reach the Query cache for the persisted copy to include them. Whether
  `@tanstack/query-db-collection` mirrors them into the cache, and whether a restored
  cache makes the collection report `ready` before the network answers, is
  **unverified** and decides whether the dashboard needs its own "restored" flag.
- The restore must finish before the collections mount, which the provider's
  `isRestoring` state handles but which changes app start-up for admin routes only.
- IndexedDB is not encrypted; see [Privacy](#privacy).

### Privacy

What would be on the device: for registrations, each row carries `person`
(name, email, phone), `notes` (which can hold accessibility needs), order items,
payment amounts and status, check-in state and table allocations. The list
endpoint omits `checkInToken`; the detail endpoint returns it. That is a bounded
set of personal data for every guest of the active edition, in an unencrypted
store (IndexedDB or an OPFS SQLite file) in the browser profile.

Why the existing policy does not cover it:

- [#934](934-data-retention-and-erasure.md) governs the server. A device copy is a
  new copy outside the retention sweeps and outside erasure. An anonymised person
  (`POST /api/people/{id}/anonymise`) stays legible in an offline device's copy
  until that device next syncs.
- #934 declined encryption at rest because the NISS/eID fields sit behind an
  authenticated admin API. A local file removes that barrier, so that reasoning
  does not carry over. Neither option encrypts at rest.
- The sign-in token already lives in `localStorage` (see `config/oidc.ts`), but a
  token expires, is revoked on sign-out (`revokeTokensOnSignout`) and is useless
  without the server. A persisted guest list outlives all three.
- The published privacy policy is owner-managed through the #944 editor (a
  [snapshot](../public-documents/README.md) is kept in the repository). It says
  cookies and local storage keep you signed in and remember your language; it does not
  mention a guest-data cache in an admin's browser. Whether that needs wording is
  condition 4 below; this record does not author policy text.

**Conditions before any persisted collection of guest data exists:**

1. **Scope.** Only the collections the [#1175 hand-over](tanstack-db.md#hand-over-to-1168-persistence)
   marks persistable, registrations under the edition key, selected by an allowlist. Never people pages, the
   registration list pages, payment ledgers, `checkInToken`, NISS or eID.
2. **Wipe, independent of the dashboard.** On sign-out, on a start where the user
   is not authenticated, on losing the admin or volunteer role, on an edition change
   and on `schemaVersion` bump. The current wipe is an effect in `useAdminQueries`
   that runs only while the admin dashboard is mounted; a persisted store needs an
   app-level owner that works when that screen never renders (expired session,
   reopened tab): on start, before restoring, check the session and call
   `removeClient` instead of restoring. A second tab's sign-out must wipe too (a
   `storage`/`BroadcastChannel` signal, or the next restore's session check).
3. **Device retention limit.** A restore older than a fixed time since the last
   successful write is discarded (`maxAge`). The owner chose "the full weekend"; as a
   concrete number that is 72 hours, so a device that last synced on the Friday is
   still usable through Sunday. Every successful sync restarts the clock. The
   number is one constant, easy to change.
4. **No new public wording; a check and an internal rule instead.** The public
   documents stay short and plain. An on-device copy is the same data, purpose and
   controller as the server copy, so it is a security measure (conditions 1 to 3),
   not a new disclosure; the existing policy already covers cookies and local storage
   in general ([snapshot](../public-documents/README.md)). Before the first release
   that persists registrations the owner reads the current policy once for a claim the
   warm start would contradict (for example "stored only on our servers") and amends
   only if there is one. Volunteers' devices get an internal rule: screen lock, the
   organisation's sign-in, sign out on shared devices. The retention number is
   settled (condition 3). This is a reading of the duty, not legal advice.
5. **Visible state.** The UI shows when it is rendering restored rows and when they
   were last synced (from the query's `dataUpdatedAt` and `isFetching`), so nobody
   mistakes a restored list for current data.

The non-personal collections need conditions 2 and 5 only (a wipe on sign-out
keeps one rule for all admin state).

### Which collections, and invalidation

In this order and no wider than needed:

| Collection | Persist | Notes |
| --- | --- | --- |
| Tables, venues, rooms, table types, layouts, areas | Yes, as complete sets | No guest data; `buster` on row-shape changes. |
| Organizations | Yes | Name, active flag, contact person id. |
| Registrations of the active edition | Yes, in the first release, only with all five conditions met | #1182 completed: the edition is in the key; restore and edition-switch isolation still need persistence tests. |
| People pages, registration list pages | **Never** | Query results, partial by construction. |

A persisted subset is invalidated by (a) `buster`, changed with any row-shape change
in the frontend types; (b) the edition in the registrations query key; (c) the wipe
conditions above; (d) `maxAge`; and (e) the eager refetch itself, which replaces the
rows with the server's complete answer. No collection uses on-demand sync,
so there is no partial subset to mistake for a complete one.

### Staleness and conflicts

Server state stays authoritative; persistence only supplies the first rows. The points below apply to both options unless named.

- **Live events.** Patches already go through `writeUpsert`/`writeDelete`. Option A would write
  them through to SQLite; Option B persists them only if they reach the Query cache
  (unverified, above). The per-id timestamp
  guard is in memory and restarts empty, which is fine: restored rows carry no
  timestamp, so any event applies. Events missed while the page was closed or offline
  are not replayed. The convergence points are the SSE `ready` frame, which triggers
  blanket recovery ([#929](https://github.com/tjorim/champagnefestival/issues/929)), and `onReconnect`, which
  invalidates. Until one of them runs, restored occupancy and check-in state can be
  stale, and a stale seating picture is the operational risk on event day.
- **`staleTime`.** With Option B a restored query is just an old cache entry, so the
  existing 60 second `staleTime` makes the mount refetch at once and the rows are
  replaced when the answer arrives; `retry: false` means a failing network leaves the
  restored rows in place with `error` set, which is the flaky-connection case.
  The query `gcTime` must be at least `maxAge` (TanStack's guidance), or
  restored entries are garbage-collected early. Option A has its own timeout-based strategy (`networkTimeoutMs`) instead.
- **Writes.** Nothing changes: the server rechecks capacity under lock, check-in is
  idempotent and write handlers refetch before rollback. A stale local picture can
  produce a refused write (a 409), never a wrong committed one. Offline writes are out
  of scope; the UI should disable or clearly mark writes while the connection is down
  rather than queue them.
- **Session fence.** `state/epochFence.ts` drops responses that arrive after sign-out
  or a collection swap. A persisted store adds a second async writer (the persister's write, or the SQLite
  transaction) that the fence would also have to cover: a write that lands after the
  wipe must not recreate the data.
- **Tabs.** Option A needs the `BrowserCollectionCoordinator`; Option B shares one
  blob, last writer wins.

### Relation to the event-day Android and offline plans

- **Web check-in** is live-only by design ([#937](https://github.com/tjorim/champagnefestival/issues/937), [Web Push decision](941-web-push-foundation.md):
  the service worker does no caching and queues nothing). This record does not
  change that. A warm start is read-only and does not make check-in work offline.
- **Android** has its own offline check-in queue (`PendingCheckInStore`, DataStore;
  see `android/README.md`), replayed through the idempotent check-in endpoint. It
  is independent of anything decided for the admin tables.
- **Check-in on bounded data.** Check-in must stay usable on its own bounded data;
  it does not read the collections today (it looks up one registration by token and
  searches volunteers on the server), so the warm start neither helps nor endangers
  it. If the owner ever wants offline web check-in, it should be a purpose-built store
  of the event's roster with minimal fields (id, name, party size, checked-in state)
  and a replay queue relying on the same idempotent endpoint, under its own decision
  and retry-safety entry. It should not be a persisted copy of the admin registrations
  collection (full person data, payments and notes).

## Dependencies

- **Registration scoping is complete ([#1182](https://github.com/tjorim/champagnefestival/issues/1182),
  2026-10-07).** The collection loads only the active edition, keyed by its edition
  id, and loads nothing without an active edition. This removes the former
  all-history dependency. Persistence implementation (#1197) must still verify
  edition-switch isolation, restore ordering and every privacy condition above.
- **The rest has no dependency** and can be built first: the plumbing (persister,
  allowlist, `maxAge`, `buster`, wipe, last-synced state) and the collections without
  guest data (tables, venues, rooms, table types, layouts, areas, organizations).
- **Organization self-service ([#1190](https://github.com/tjorim/champagnefestival/issues/1190))**
  changes the organization row shape (description, translations, logo) and adds a manager
  login. Each row-shape change bumps `buster`. The persisted cache belongs to admin and
  volunteer sessions only; a manager or visitor session must neither restore it nor leave
  one behind, and the wipe covers a switch to such a session.

## Gates and reopen triggers

The implementation issue carries these gates:

1. First, before any wiring to the dashboard: answer the [unverified](#original-verification-questions-and-remaining-checks)
   questions with a test or a throwaway branch. A failed answer returns to this record.
2. The wipe, `maxAge`, `buster`, edition-change and restore-ordering tests pass.
3. The owner has done the policy check and set the device rule (condition 4) before the
   first release that persists registrations.

Reopen Option A (SQLite) if one of these becomes true: the Query-cache blob proves
too large or slow for the registrations list; the owner reverses #937 and wants a
store that survives offline writes; or `@tanstack/browser-db-sqlite-persistence`
reaches a stable release against the `@tanstack/db` version we run.

## Original verification questions and remaining checks

The original questions below were implementation gates. Query mirroring, cached
rendering, wipe/fences and failure fallback are now verified in the
[implementation evidence](#implementation-verification-1197-2026-10-07).
Production-edition sizing, volunteer-device/private-mode checks and the owner's
current-policy check remain release work. The evidence records synthetic scale
measurements separately from those outstanding operational checks.
- Option A only: transferred WASM and worker size, which OPFS VFS the package uses
  and whether it needs `SharedArrayBuffer` and cross-origin isolation, and the CSP
  in `/opt/apps/infra`.

## References

- [TanStack Query persistence (`persistQueryClient`, persisters)](https://tanstack.com/query/latest/docs/framework/react/plugins/createPersister)
- [TanStack DB 0.6 announcement](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)
- [`@tanstack/browser-db-sqlite-persistence` README](https://github.com/TanStack/db/blob/main/packages/browser-db-sqlite-persistence/README.md)
- [`db-sqlite-persistence-core` 0.4.0 release (network-first initial render)](https://github.com/TanStack/db/releases/tag/%40tanstack/db-sqlite-persistence-core%400.4.0)
- [TanStack DB decision](tanstack-db.md), [data retention](934-data-retention-and-erasure.md), [Web Push foundation](941-web-push-foundation.md)
- `frontend/src/hooks/useAdminQueries.ts` (sign-out reset), `frontend/src/state/epochFence.ts`,
  `frontend/src/state/LiveUpdatesProvider.tsx`, `frontend/src/components/CheckInPage.tsx`

## Implementation verification (#1197, 2026-10-07)

The implementation uses Query v5's `persistQueryClientRestore` and
`persistQueryClientSave` with an IndexedDB async persister. Restore happens in a
staging QueryClient, then hydrates the app only if the session epoch still
matches. The app-level AuthProvider owns it even when the dashboard never mounts.
The owner identity includes the configured OIDC authority/client and subject;
only authenticated, unexpired admin/volunteer sessions can restore. Sign-out,
unauthenticated startup, role loss, account changes, edition changes and a
second tab's sign-out wipe the record. Token expiry also has an app-level
timer, independent of dashboard mounting or an OIDC state update. Pending writes check the epoch after
opening IndexedDB and before creating their transaction; transactions already
started precede the wipe transaction. A restore resolving after wipe is discarded.

- **Direct writes verified:** `adminWarmStart.verify.test.ts` runs the installed
  query-collection adapter, verifies immediate cached rendering before a pending
  fetch, retained rows after a failed fetch, and Query-cache mirroring of both
  `writeUpsert` and `writeDelete`. No adapter workaround is needed.
- **Restore ordering verified:** allowlisted cache entries hydrate before eligible
  authenticated children mount. The dashboard bypasses its global skeleton after
  a warm start: unrelated people/count/page queries cannot hide restored rows.
  Each collection refetches on mount even when the saved data is younger than its
  60-second stale time. Cached rows survive failed reconciliation.
- **Scope verified:** whole-key allowlist, active-edition registrations only, no
  mutations. Tests exclude registration pages, check-in statistics, people and
  ledgers. A defensive recursive copy removes check-in tokens and NISS/eID fields
  (including mapped national-register/document-number fields), since live detail
  responses can introduce those into the collection. Failed-query error state is
  not stored; the last successful rows remain usable.
- **Wipe/retention verified:** IndexedDB-backed tests cover restore, unauthorized
  startup, role loss without a dashboard, sign-out, second-tab notification,
  account mismatch, token expiry, edition switching, 72-hour expiry, buster mismatch, delayed
  restore and delayed-write fences. Read/write failures fall back to memory.
  Opening a blocked/unresponsive database has a two-second bound. The single
  `ADMIN_CACHE_MAX_AGE` also sets Query `gcTime`; the buster is
  `admin-collections-1` and must change whenever an allowlisted frontend row shape
  changes. The cache saves on successful collection data updates, in batches of
  at most one write per second; failed reads do not extend retention.
- **Visible state:** a polite status alert says that saved rows are being shown
  and gives the oldest `dataUpdatedAt` among the cached collections. The saved-row
  message clears once all restored queries reconcile. Only the edition ID is
  metadata; the active-edition Query entry itself is not persisted. If its request
  fails, the ID selects the saved registration collection, with no fabricated
  edition title or dates. A successful different edition wipes the old copy.
- **Browser check:** a cached development session was reloaded with API requests
  failing; the saved venues, rooms and table types remained readable alongside
  the saved-row/last-sync alert and connection error. Server-paginated people and
  registration tables, content-management queries and edition metadata remain
  live reads; persistence benefits their bounded collection consumers, not those
  separate queries. No offline write or web check-in is added.

### Size and device limits

Chromium 154 on the development Linux machine, synthetic full-set fixtures made
from the repository's registration seeds through `apiToRegistration`:

| Rows | JSON bytes | JSON serialization | IndexedDB transaction |
| --- | ---: | ---: | ---: |
| 1,000 | 1,212,891 | 5.4 ms | 12.5 ms |
| 10,000 | 12,138,891 | 47 ms | 123.1 ms |

These single-run measurements cover mapped row payloads, not production guest
records, the small Query envelope, or the complete persister's defensive JSON
copy. They justify batching before dehydration rather than serializing on every
Query notification. They are not a claim about volunteers' hardware. Quota in
this browser was approximately 10 GiB; availability/quota errors are tested,
but actual volunteer devices/private-browser modes and a representative full
production edition still need an operational check before release.

### Remaining release conditions

The owner still needs to read the current published privacy policy for any
contradictory claim. The repository's published snapshot contains no
"only on our servers" claim; that inspection does not stand in for the owner's
check of the current policy. No public policy wording was changed.

Internal volunteer device rule: use a screen lock and the organisation's sign-in,
and sign out on shared devices. The device copy is unencrypted; signing out
removes it. Include this rule in the event briefing.

No externally callable write path changed, and no automatic retry or queue was
added. `docs/retry-safety.md` needs no new entry.


### Validation

Frontend lint, formatting, typecheck and production build passed. The full unit
suite passed 953 tests with four workers (one pagination timeout in the earlier
unrestricted run passed its isolated rerun). The authenticated Chromium warm-start
regression passed with reads deliberately pending across reload, then rejected;
saved venue/room rows remained visible in both states. The additional token-expiry
regression covers removal without a dashboard or provider state update.

## Cross-app lifecycle alignment

The [browser persistence contract](../browser-persistence-contract.md) aligns account isolation,
schema checks, asynchronous cleanup and storage failure across the five apps.
App-specific retention and offline capabilities remain as documented here.
