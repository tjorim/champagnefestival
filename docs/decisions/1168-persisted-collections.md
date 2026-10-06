# Persisted TanStack DB collections for event-day admin resilience

**Status:** Deferred; persisting guest data is rejected until the privacy conditions below are met
**Decided:** 2026-10-06, [#1168](https://github.com/tjorim/champagnefestival/issues/1168)
**Depends on:** [#1175](https://github.com/tjorim/champagnefestival/issues/1175) (done; see the [hand-over](tanstack-db.md#hand-over-to-1168-persistence))

This record is desk research against the packages' published documentation and
the current code. No spike branch was built and no bundle was measured; the
items that need a measurement or a running spike are listed under
[Unverified](#unverified-and-needed-before-any-adoption).

## Decision

**Do not persist any collection now. Reopen when one of the
[triggers](#reopen-triggers) fires.**

- **Rejected for guest data** (registrations and anything derived from people)
  until the [privacy conditions](#privacy) are settled and met. The privacy
  question is settled here as a set of conditions, not as permission.
- **Deferred for the non-personal collections** (tables, venues, rooms, table
  types, layouts, areas; exhibitors only carry a name and a contact person id).
  Nothing about them is blocked, but nothing is gained: they are small lists that
  already load quickly, and a floor plan without occupancy is not useful on event
  day. Persisting them alone would add a WASM database, a worker and a sign-out
  path for no event-day benefit.
- **The reason is value, not only risk.** Web check-in is live-only by the
  owner's decision ([#937](https://github.com/tjorim/champagnefestival/issues/937), "no offline write queue is
  planned"), and the check-in page does not read the collections: it looks up one
  registration by token (`fetchCheckInRegistration`) and searches volunteers on the
  server. Android already has its own offline queue. A persisted admin collection
  would only make the admin dashboard render earlier from rows that may be
  stale, while every write still needs the network.

No implementation issue is created, because nothing was adopted. This change adds no
write behavior, so `docs/retry-safety.md` needs no entry.

## Questions from the issue

### Package, storage backend, size, CSP and workers

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
  adapter combination) were reported against it; both were
  reported with the Electric adapter, not `queryCollectionOptions`, but they show the
  layer is young. Pre-1.0 is already an accepted risk for the in-memory
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

### Privacy

What would be on the device: for registrations, each row carries `person`
(name, email, phone), `notes` (which can hold accessibility needs), order items,
payment amounts and status, check-in state and table allocations. The list
endpoint omits `checkInToken`; the detail endpoint returns it. That is a bounded
set of personal data for every guest of the active edition, in an unencrypted
SQLite file in the browser profile.

Why the existing policy does not cover it:

- [#934](934-data-retention-and-erasure.md) governs the server. A device copy is a
  new copy outside the retention sweeps and outside erasure. An anonymised person
  (`POST /api/people/{id}/anonymise`) stays legible in an offline device's copy
  until that device next syncs.
- #934 declined encryption at rest because the NISS/eID fields sit behind an
  authenticated admin API. A local file removes that barrier, so that reasoning
  does not carry over. The persistence packages offer no encryption.
- The sign-in token already lives in `localStorage` (see `config/oidc.ts`), but a
  token expires, is revoked on sign-out (`revokeTokensOnSignout`) and is useless
  without the server. A persisted guest list outlives all three.
- The published privacy policy is owner-managed through the #944 editor and does
  not describe data stored in an admin's browser. This record does not author that
  text.

**Conditions before any persisted collection of guest data exists:**

1. **Scope.** Only the collections the [#1175 hand-over](tanstack-db.md#hand-over-to-1168-persistence)
   marks persistable, registrations under the edition key. Never people pages, the
   registration list pages, payment ledgers, `checkInToken`, NISS or eID.
2. **Wipe, independent of the dashboard.** On sign-out, on a start where the user
   is not authenticated, on losing the admin or volunteer role, on an edition change
   and on `schemaVersion` bump. The current wipe is an effect in `useAdminQueries`
   that runs only while the admin dashboard is mounted; a persisted store needs an
   app-level owner that works when that screen never renders (expired session,
   reopened tab). The README documents no deletion API, so the wipe has to be
   verified (truncate versus removing the OPFS entry).
3. **Device retention limit.** Rows older than a fixed time since the last
   successful sync are discarded on open. Proposed: 48 hours (an event weekend plus
   a day); the owner confirms the number.
4. **Owner sign-off** on the retention number and a published privacy-policy update
   describing on-device copies, before the first release that persists.
5. **Visible state.** The UI shows when it is rendering restored rows (via
   `persistedStatus`), so nobody mistakes a restored list for current data.

The non-personal collections need conditions 2 and 5 only (a wipe on sign-out
keeps one rule for all admin state).

### Which collections, and invalidation

If adopted later, in this order and no wider than needed:

| Collection | Persist | Notes |
| --- | --- | --- |
| Tables, venues, rooms, table types, layouts, areas | Yes, as complete sets | No guest data; fixed `schemaVersion`. |
| Exhibitors | Yes | Name, active flag, contact person id. |
| Registrations of the active edition | Only with all five conditions | Keyed by edition, so another edition never shows. |
| People pages, registration list pages | **Never** | Query results, partial by construction. |

A persisted subset is invalidated by (a) `schemaVersion`, which per the TanStack
announcement clears the local copy and re-syncs, bumped with any row-shape change
in the frontend types; (b) the edition key for registrations; (c) the wipe
conditions above; (d) the retention limit; and (e) the eager refetch itself, which
replaces rows with the server's complete answer. No collection uses on-demand sync,
so there is no partial subset to mistake for a complete one.

### Staleness and conflicts

Server state stays authoritative; persistence only supplies the first rows.

- **Live events.** Patches already go through `writeUpsert`/`writeDelete`, so with
  persistence they would also be written through to SQLite. The per-id timestamp
  guard is in memory and restarts empty, which is fine: restored rows carry no
  timestamp, so any event applies. Events missed while the page was closed or offline
  are not replayed. The convergence points are the SSE `ready` frame, which triggers
  blanket recovery ([#929](https://github.com/tjorim/champagnefestival/issues/929)), and `onReconnect`, which
  invalidates. Until one of them runs, restored occupancy and check-in state can be
  stale, and a stale seating picture is the operational risk on event day.
- **`staleTime`.** The 60 second `staleTime` and `retry: false` do not know about
  restored rows. Whether a mount with restored rows refetches immediately, and
  whether the collection reports `ready` before the network answers, must be
  checked in the spike. The status fields are separate from collection readiness, so
  the dashboard would have to distinguish "restored" from "synced".
- **Writes.** Nothing changes: the server rechecks capacity under lock, check-in is
  idempotent and write handlers refetch before rollback. A stale local picture can
  produce a refused write (a 409), never a wrong committed one. Offline writes are out
  of scope and would need `@tanstack/offline-transactions` plus a retry-safety entry
  per write.
- **Session fence.** `state/epochFence.ts` drops responses that arrive after sign-out
  or a collection swap. A persisted store adds a second async writer (the SQLite
  transaction) that the fence would also have to cover.
- **Tabs.** Several admin tabs need the `BrowserCollectionCoordinator`, and a
  second tab's sign-out must wipe the first's store.

### Relation to the event-day Android and offline plans

- **Web check-in** is live-only by design ([#937](https://github.com/tjorim/champagnefestival/issues/937), [Web Push decision](941-web-push-foundation.md):
  the service worker does no caching and queues nothing). This record does not
  change that, and a persisted admin collection does not make check-in work offline.
- **Android** has its own offline check-in queue (`PendingCheckInStore`, DataStore;
  see `android/README.md`), replayed through the idempotent check-in endpoint. It
  is independent of anything decided for the admin tables.
- **Check-in on bounded data.** Check-in must stay usable on its own bounded data.
  If the owner ever wants offline web check-in, it should be a purpose-built store
  of the event's roster with minimal fields (id, name, party size, checked-in state)
  and a replay queue relying on the same idempotent endpoint, under its own decision
  and retry-safety entry. It should not be a persisted copy of the admin registrations
  collection (full person data, payments and notes).

## Reopen triggers

Reopen this decision, with a spike branch, when any of these is true:

1. A measured event-day problem: slow or failed admin loads on the venue network
   that a reload or the existing connectivity banner does not cover.
2. The owner reverses #937 and asks for offline web check-in (see the bounded store
   above).
3. `@tanstack/browser-db-sqlite-persistence` reaches a stable release and our
   `@tanstack/db` is upgraded to the version it requires.
4. The owner settles conditions 3 and 4 of the [privacy section](#privacy) (retention
   number and policy text), which unblocks persisting registrations.

## Unverified and needed before any adoption

- Transferred size of the WASM and worker, and whether it stays out of the public
  bundle.
- Which OPFS VFS the package uses, and whether it needs `SharedArrayBuffer` and
  cross-origin isolation (and so COOP/COEP headers in `/opt/apps/infra`).
- Whether a deletion API exists, and that sign-out, role loss and expiry really
  leave no rows (the wipe condition).
- `staleTime` and `ready` behavior with restored rows against our
  `queryCollectionOptions` wiring, on the upgraded `@tanstack/db`.
- OPFS availability on the devices volunteers use, including private browsing.

## References

- [TanStack DB 0.6 announcement](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)
- [`@tanstack/browser-db-sqlite-persistence` README](https://github.com/TanStack/db/blob/main/packages/browser-db-sqlite-persistence/README.md)
- [`db-sqlite-persistence-core` 0.4.0 release (network-first initial render)](https://github.com/TanStack/db/releases/tag/%40tanstack/db-sqlite-persistence-core%400.4.0)
- [TanStack DB decision](tanstack-db.md), [data retention](934-data-retention-and-erasure.md), [Web Push foundation](941-web-push-foundation.md)
- `frontend/src/hooks/useAdminQueries.ts` (sign-out reset), `frontend/src/state/epochFence.ts`,
  `frontend/src/state/LiveUpdatesProvider.tsx`, `frontend/src/components/CheckInPage.tsx`
