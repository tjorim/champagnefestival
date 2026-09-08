# Service-worker ownership and Web Push subscription foundation

**Status:** Implemented in #1014 (2026-09-07); #941 closed.

## Decision: one service worker, additive per-feature modules

`frontend/src/sw.ts` is the single production worker, built by
`vite.sw.config.ts` into `dist/sw.js` and registered from `main.tsx`.
Feature modules add their own handlers. If a future feature needs caches,
it owns independently versioned cache names and must not delete another
feature's caches. The current worker does not cache pages or queue writes.

#936 introduced the base worker; #941 added `push` and `notificationclick`
handlers. #937 deliberately requires live connectivity for check-in; an
offline replay queue is not planned. Native Android notifications are outside
this public browser feature's scope. iOS users need the home-screen PWA for
browser push; the UI handles unsupported browsers.

## Subscription and consent contract

Subscriptions are anonymous and device-scoped, keyed by endpoint. The model
stores locale, categories/event IDs, consent and activity timestamps. The
public UI currently uses the default category and no event targeting; #942
broadcasts to all opted-in subscribers.

An explicit consent checkbox precedes the browser permission prompt. UI copy
lives in the three translation files. Formal privacy-policy publication is
left to the owner through the policy editor; implementation does not silently
publish legal text. VAPID secrets remain deployment-managed.

Subscribe/unsubscribe use PostgreSQL rate limits; commit their counter before
validation can reject and roll back a request. Admin test-send uses a local
per-actor limit under the [one-worker decision](932-multi-worker-state.md).

## Implementation summary

Admin test-send enqueues `web_push_test` through the [durable outbox](../outbox-worker.md).
The composer reuses the same delivery primitives. Delivery checks the endpoint
hostname for public addresses and disables redirects. Notification clicks use
the fixed `/` route, never a payload-supplied destination. Serialized payloads
are limited to 4096 bytes.

Explicit unsubscribe and 404/410 delivery responses retire subscriptions.
A daily sweep removes stale rows after `push_subscription_expiry_days`
(default 180, strictly positive). Successful delivery refreshes `last_seen_at`.

The browser hook reconciles an existing subscription on mount, refreshing
locale/activity. Waiting for worker readiness is bounded by a five-second
timeout. If backend unsubscribe fails after browser unsubscribe succeeds,
the endpoint is retained for retry. See [retry safety](../retry-safety.md).

## Known limits

`pushsubscriptionchange` is not handled; mount-time reconciliation is the
current recovery mechanism. Category/event targeting needs a future opt-in
UI and sender design. Bulk email is not part of Web Push.

Tests: `backend/tests/test_push.py`, `usePushSubscription.test.ts`, and
`PushOptIn.test.tsx` cover consent, delivery, limiting, cleanup and accessibility.

## Historical context

Consolidated 2026-09-08. The [full pre-consolidation document](https://github.com/tjorim/champagnefestival/blob/88396baf3275ae40cdd907239a0df6a04baed137/docs/decisions/941-web-push-foundation.md) preserves the original findings, proposals, acceptance criteria, and implementation history.
