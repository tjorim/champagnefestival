# Browser persistence contract

Decision date: 2026-10-07. Applies to Champagnefestival, Travel, Worktime,
Daynest and BorderTax. Align lifecycle guarantees while keeping each app's
storage model appropriate to its data. A shared package is not required.

## Shared guarantees

1. **Ownership before restore or replay.** Authenticated records belong to their
   original account and API scope. A new account must never inherit a previous
   account's data or pending requests. Anonymous local drafts and calculator
   preferences are explicitly device-local.
2. **Validate before use.** Restore accepts only the supported schema and valid
   payloads. Disposable incompatible snapshots can be discarded; incompatible
   pending edits must be retained outside automatic replay until reviewed.
3. **Restore before the first fetch.** A fetch that sees an empty, unhydrated
   collection must not overwrite saved rows. Keep live local changes separate
   from stale server snapshots and expose storage failures without crashing.
4. **Fence asynchronous work.** Account changes and logout invalidate pending
   restoration, persistence and replay. A late response must not recreate a
   wiped cache. Already submitted server writes can finish; a client fence
   cannot undo a request already accepted by the server.
5. **Separate cached reads from pending edits.** Logout wipes disposable
   authenticated read caches. Pending edits remain isolated to their original
   owner and resume only after that owner authenticates again. Do not apply a
   cache TTL to unsynced edits. Explicitly pinned Travel copies and their keys
   are removed on sign-out under Travel's existing product policy.
6. **Retry only with evidence.** Automatic replay requires a documented
   operation-specific strategy and regression coverage. Creates, relative
   actions and credential generation need a stable replay identity first.
   Authentication, conflict and rate-limit failures do not count as success.
7. **Tell the truth about saved state.** Saved rows are distinguishable from
   freshly fetched rows; queued actions are distinguishable from completed
   actions. Do not promise persistence when the write failed. Preserve legacy
   pending data with unknown ownership without silently assigning it to the
   current account.
8. **Storage is fallible.** Denied storage, quota failures and incompatible
   browsers leave the online or in-memory app usable. Never report an unsaved
   action as queued. Coordinate replay across tabs to avoid simultaneous sends.

## App-specific policies

| App | Model | Retention and session policy |
| --- | --- | --- |
| Champagnefestival | Allowlisted read-only TanStack Query snapshot in IndexedDB | 72 hours, schema buster, sensitive-field filtering, owner-scoped restore gate; logout/role loss clears cache. No outbox. |
| Travel | Explicit encrypted IndexedDB pins | Seven-day lease, reconnect authorization check; logout atomically removes keys and copies and advances a durable owner generation. Schema mismatch is rejected. |
| Worktime | TanStack DB collection snapshots plus sync outbox | Restore barrier and generation-scoped snapshots; account transition clears old snapshots, per-owner pending sync changes are retained. Anonymous authored data supports the existing first-sync flow. No arbitrary expiry for drafts. |
| Daynest | Account-scoped offline action records | Schema version 1; only explicit task/chore/medication absolute status transitions replay. Web Locks serialize replay across tabs. Sign-out stops replay but preserves pending actions. Legacy unowned records remain quarantined. |
| BorderTax | Validated calculator inputs and theme in localStorage | Device-local preferences; no authenticated cache or replay queue, no arbitrary expiry. Storage failure falls back to the current in-memory session. |

## Verification

Cover restore/reload, incompatible schema, unavailable storage, account A to B,
logout during pending asynchronous work, and concurrent tabs where applicable.
Outboxes additionally cover uncertain responses, failed authentication,
conflicts, rate limits, concurrent enqueue/drain and unsafe-operation rejection.
Encryption does not replace lifecycle checks; client storage is not a substitute
for server authorization.

Daynest's legacy `daynest-offline-queue` is preserved verbatim and is not
migrated to an account automatically. The UI explains that those actions require
manual reconciliation. New records use individual versioned keys to avoid a
drain overwriting concurrently queued actions. Browsers without Web Locks keep
saved actions but do not automatically replay them. Broader offline operation
support must extend the allowlist, retry-safety inventory and tests together.
