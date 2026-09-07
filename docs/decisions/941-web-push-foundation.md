# Service-worker ownership and Web Push subscription foundation

**Status:** Implemented (2026-09-07) — see "Implementation summary" below.
**Date:** 2026-09-03 (updated 2026-09-05, confirmed and implemented 2026-09-07)
**Issues:** [#941](https://github.com/tjorim/champagnefestival/issues/941)
(primary); [#936](https://github.com/tjorim/champagnefestival/issues/936)
(shipped the base file — see below); [#937](https://github.com/tjorim/champagnefestival/issues/937)
(historical context — no longer a co-tenant, see below)

---

## Update: base worker shipped for #936

`frontend/src/sw.ts` now exists, built by `vite.sw.config.ts` into
`dist/sw.js` and registered from `main.tsx` in production — exactly the
shape this document specifies below, brought forward by #936 (public-site
discoverability) because a registered service worker is one of the PWA
installability criteria browsers check before offering "Add to Home
Screen." It ships with only the bare `install`/`activate`/`fetch`
skeleton — plain network passthrough, no caching, no queued writes — so it
does not preempt any of #941's decisions below. #941 adds its `push` /
`notificationclick` listeners and versioned cache name into this same file
rather than creating it.

## Update: #937 no longer needs a service worker

This document originally settled a shared service-worker contract between
offline check-in (#937) and Web Push (#941), per the product audit's
coordination note. #937's offline queue/precache work was subsequently
descoped by product decision: check-in requires live connectivity, so a
guest whose device is offline is expected to wait or use the volunteer
manual-search fallback, not have their check-in queued and replayed later.
The connectivity banner shipped in #937 (which states check-ins can't be
submitted while offline) is the intended behaviour, not a stopgap for a
queue that's coming later. #937 shipped without a service worker and won't
need one.

The contract below is kept for #941 alone, and for any future feature that
does need a production service worker — the additive-module structure means
a later consumer still doesn't have to redesign it.

## Context

Web Push (#941) needs a production service worker. This document settles
its shape now, before implementation starts, and separately proposes answers
to the questions #941 lists as required "before implementation."

## Decision: one service worker, additive per-feature modules

- **One file, one registration.** `frontend/src/sw.ts`, built by Vite as a
  separate entry (`build.rollupOptions.input`) and registered once from
  `main.tsx` via `navigator.serviceWorker.register`.
- **Versioned cache names.** Each feature that needs caching owns a cache
  name with an embedded version segment it controls independently — e.g.
  `push-assets-v1` — so bumping one feature's cache in `activate` (deleting
  stale versions) never touches another's.
- **Additive event handlers.** The worker's `install`, `activate`, and
  `fetch` handlers are composed from small per-feature functions imported
  into `sw.ts` (`registerPushHandlers()` adding its own `push` and
  `notificationclick` listeners). A feature that doesn't need a given event
  type simply doesn't contribute a handler for it.
- **Why keep this structure with only one consumer.** Even with #937 out of
  the picture, the same shared-worker constraint applies to any second
  future consumer (there can only ever be one production service worker
  registration for the site), so the additive-module shape is worth building
  correctly from #941 onward rather than revisiting it later.

## #941's pre-implementation decisions (confirmed 2026-09-07)

The issue lists these as decisions to document before implementation. Two
diverge from this document's original proposed defaults — the project owner
corrected the subscriber model and expanded the category/event scope beyond
"admin test-send only":

| Question | Confirmed decision | Rationale |
| --- | --- | --- |
| Anonymous vs. authenticated subscriptions | **Anonymous, public.** Any visitor can subscribe, no account needed | Corrected from this document's original "authenticated only" proposal: "administrator-only" in the issue describes who can *send* (the admin test-send button), not who can *subscribe*. #941 ships only the admin test-send, not a public composer (#942 still owns that), but restricting subscriptions to staff accounts would leave #942 nothing to eventually broadcast to |
| Account vs. device scope | Per-device | A push subscription is inherently tied to a browser/device endpoint; per-account fan-out to all of a user's devices can be layered on later without a schema change |
| Categories/defaults | **Multi-category schema, built now** (not the originally-proposed single "system test" category) | Owner chose to build real category support upfront rather than a single-category placeholder, to avoid a second migration when #942 needs categories |
| Event-specific subscriptions | **Built now** (not deferred, as originally proposed) | Owner chose to add event-scoping to the subscription model in this phase rather than waiting for #942 to need it |
| Retention | Subscription rows retained until explicit unsubscribe or a 404/410 push response retires them, **plus a time-based expiry sweep** (auto-retire subscriptions with no successful delivery in N months) for accounts that go stale without the push service ever reporting it (e.g. browser data cleared) | Matches the issue's "retire subscriptions on 404/410" requirement as the primary path, with the sweep as a documented addition covering the gap that mechanism can't see |
| Browser/iOS expectations | Confirmed: iOS Safari requires the PWA installed to the home screen for Web Push (a platform constraint, not a choice) | Factual constraint, not a design decision |
| Future Android boundary | Confirmed out of scope — the existing native Android app is a volunteer/staff-only tool (check-in scanning) with its own notification channel, unrelated to this public-facing web-push feature | Avoids conflating browser push with the native app's FCM/notification path |
| GDPR/privacy consent language | Claude drafts consent copy during implementation, matching the existing `privacyPolicy.ts` pattern (`privacy_camera_title`/`privacy_camera_content`); project owner reviews and approves before shipping | Anonymous public subscriptions (see above) make this copy load-bearing, not optional — still not something to finalize unilaterally, but drafting a reviewable starting point is more useful than leaving it a placeholder |

## What remains before #941 can be implemented

1. ~~Confirmation (or correction) of the defaults above from the project
   owner.~~ Done — see "confirmed 2026-09-07" above.
2. ~~Rate limiting for the subscription-mutation endpoints.~~ Done — see
   "Implementation summary" below.
3. ~~Actual GDPR/consent copy.~~ Done — see "Implementation summary" below.
   The UI opt-in copy shipped as reviewable i18n strings; the formal
   privacy-policy document text is deliberately left for the project owner
   to add via #944's admin editor, matching the precedent #934 already set
   for its own consent surfaces, rather than auto-migrated into a document
   the owner hasn't reviewed.

## Implementation summary (2026-09-07)

Shipped per the confirmed decisions above:

- **Backend:** `PushSubscription` model (anonymous, `endpoint`-keyed,
  `categories`/`event_ids` free-form arrays), migration, `app/push.py`
  (VAPID-signed delivery via `pywebpush`, retires a subscription on a
  404/410 response instead of retrying it), `app/services/push_service.py`
  (subscribe/unsubscribe/cleanup), and `POST /api/push/*` +
  `GET /api/push/vapid-public-key` routes.
- **Delivery reuses the #947 outbox** as the confirmed decision required:
  the admin test-send enqueues a `web_push_test` job: dispatched through
  the same lease/backoff worker as every other outbox job type, with its
  own `"delivery_queued"` audit entry from `enqueue_job`.
- **Rate limiting:** `check_push_subscription_rate_limit` extends #932's
  Postgres-backed `check_rate_limit_pg` with a `push-subscription-mutation`
  scope (20 requests/10 minutes) for the anonymous, public
  subscribe/unsubscribe endpoints, per item 2 above. The admin test-send
  endpoint uses the in-process `check_rate_limit` (10 requests/10 minutes,
  keyed by admin actor rather than IP), consistent with #932's narrower
  in-process-limiter scope for lower-volume authenticated admin actions.
- **Retention:** subscriptions are retired on a 404/410 push response, on
  explicit unsubscribe, and by a new daily `cleanup_expired_subscriptions`
  sweep (`push_subscription_expiry_days`, default 180) added to
  `worker.py`'s existing daily cleanup block — the "time-based expiry
  sweep" the confirmed decision added beyond the issue's original
  404/410-only proposal.
- **Frontend:** `usePushSubscription` hook (support detection, subscribe/
  unsubscribe, VAPID key fetch), `PushOptIn` opt-in card (explicit
  checkbox consent shown *before* the browser permission prompt, matching
  #934's marketing-opt-in pattern) rendered on both the public landing
  page and, with an admin test-send button, the admin dashboard. Push/
  `notificationclick` listeners were added to the shared service worker
  as `frontend/src/sw/push.ts`, following the additive-module contract
  above; the click handler always navigates to a fixed `"/"` path rather
  than any payload-supplied URL, per the issue's requirement.
- **Tests:** 32 backend tests (`backend/tests/test_push.py`) and 18
  frontend tests (`usePushSubscription.test.ts`, `PushOptIn.test.tsx`,
  including axe accessibility checks) cover both opt-in states, rate
  limiting, admin-only test-send auth, subscription retirement, and
  cleanup.
- **Not built:** #942's actual notification composer/broadcast UI — #941
  was scoped to the subscription foundation plus a one-off admin test-send,
  not general-purpose sending.

### Post-review hardening (2026-09-07, PR #1014)

A CodeRabbit review of the implementation PR found 8 issues, 7 fixed in the
same PR:

- **SSRF (CWE-918):** a subscribed `endpoint` is visitor-supplied and only
  constrained to `https://` at subscribe time; `app.push.deliver_web_push_test`
  now resolves the endpoint's hostname at *delivery* time (not just subscribe
  time, since DNS can change between the two — rebinding) and refuses to
  send to a private, loopback, link-local, reserved, multicast, or
  unspecified address, retiring the subscription the same way a 404/410
  response would. Delivery also goes through a `requests.Session` subclass
  that disables HTTP redirects, so a redirecting endpoint can't retarget the
  VAPID-signed request after the address check already passed. IP-range
  blocking was chosen over an allowlist of specific push-service hostnames,
  which would need updating whenever a browser vendor changes its push
  infrastructure.
- **Rate-limit bypass:** `subscribe_to_push`/`unsubscribe_from_push` now
  commit the Postgres rate-limit bucket increment immediately, before
  validation that can raise — otherwise a rejected request (e.g. an unknown
  event id) rolled back with the rest of the request's uncommitted
  transaction and was never actually counted, letting invalid requests
  bypass the limiter entirely. Matches the identical fix already shipped for
  `app.routers.check_in`.
- **Retention correctness:** a successful test delivery now refreshes
  `last_seen_at`; previously only subscribe/resubscribe did, so an actively
  delivered subscription with no resubscribe could still be swept by the
  180-day cleanup as if it were stale.
- **Config validation:** `push_subscription_expiry_days` now rejects
  zero/negative values (would otherwise let the cleanup sweep delete
  current subscriptions).
- **Frontend reconciliation:** `usePushSubscription` now re-POSTs an
  existing browser subscription to the backend on every mount (refreshing
  `locale`/`last_seen_at`), not just on first subscribe.
- **Frontend availability:** `navigator.serviceWorker.ready` never rejects,
  so a blocked/failed registration previously left the opt-in card stuck in
  "checking" forever; it's now raced against a 5-second timeout that
  surfaces as "unsupported" (hiding the card) instead of hanging.
- **Frontend unsubscribe retry:** if the browser-side unsubscribe succeeds
  but the backend delete fails, the endpoint is now retained across a retry
  instead of being re-derived from `getSubscription()` (which would already
  return `null`, silently skipping the backend delete on a second attempt).

**Deliberately not fixed:** the review also flagged that the service worker
doesn't handle the browser-initiated `pushsubscriptionchange` event (a
subscription the browser itself rotates or invalidates, distinct from an
explicit unsubscribe). Implementing this correctly needs the service worker
to independently fetch the VAPID key and resolve a locale it has no direct
access to (no `document.cookie`, no app state) — plus MDN's own guidance
that browser support for this event's `oldSubscription`/`newSubscription`
fields is inconsistent enough that production implementations still need
the mount-time reconciliation above as the primary sync mechanism regardless.
Left as a known gap rather than shipping an untested, defensive-guard-heavy
handler for an edge case (browser-rotated subscriptions are rare); revisit
if it turns out to matter in practice.

## References

- [#936](https://github.com/tjorim/champagnefestival/issues/936) — public-site
  discoverability (shipped the base `frontend/src/sw.ts` file, for PWA
  installability only — see "Update" above)
- [#937](https://github.com/tjorim/champagnefestival/issues/937) — offline
  web check-in (completed; offline queue/precache explicitly descoped, see
  "Update" above)
- [#941](https://github.com/tjorim/champagnefestival/issues/941) — Web
  Push/VAPID subscription foundation
- [#947](https://github.com/tjorim/champagnefestival/issues/947) — durable
  outbox (closed; #941 may use it for admin test-push delivery)
- `docs/product-audit-2026-08.md` — cross-cutting service-worker note
- `frontend/src/config/privacyPolicy.ts` — existing consent-copy pattern
