# Service-worker ownership and Web Push subscription foundation

**Status:** Service-worker contract decided; subscription/consent policy
proposed, pending owner confirmation before implementation starts
**Date:** 2026-09-03
**Issues:** [#937](https://github.com/tjorim/champagnefestival/issues/937),
[#941](https://github.com/tjorim/champagnefestival/issues/941)

---

## Context

Both offline check-in (#937) and Web Push (#941) need a production service
worker, and the product audit already flags that they must not ship
competing registrations or cache policies. #937's in-page QR scanning and
connectivity banner have shipped without a service worker; its remaining
offline-queue/precache work and all of #941 still need one. This document
settles the shared contract so whichever of the two lands its service-worker
code first doesn't foreclose the other's needs, and separately proposes
answers to the questions #941 lists as required "before implementation."

## Decision: one service worker, two independent feature modules

- **One file, one registration.** `frontend/src/sw.ts`, built by Vite as a
  separate entry (`build.rollupOptions.input`) and registered once from
  `main.tsx` via `navigator.serviceWorker.register`. Neither feature
  registers its own worker or scope.
- **Versioned cache names.** Each feature owns a cache name with an embedded
  version segment it controls independently — e.g. `checkin-shell-v1`,
  `push-assets-v1` — so bumping one feature's cache in `activate` (deleting
  stale versions) never touches the other's.
- **Additive event handlers.** The worker's `install`, `activate`, and
  `fetch` handlers are composed from small per-feature functions imported
  into `sw.ts` (`registerCheckInCaching()`, later `registerPushHandlers()`
  adding its own `push` and `notificationclick` listeners). A feature that
  doesn't need a given event type simply doesn't contribute a handler for
  it — `push`/`notificationclick` are additive and don't require touching
  `install`/`fetch`.
- **Consequence for sequencing.** #937 can implement the worker file and
  `registerCheckInCaching()` now without waiting on #941; when #941 is
  implemented it adds `registerPushHandlers()` to the same file rather than
  standing up a second worker. This resolves the audit's "either may go
  first" note by making "going first" mean *creating the shared file*, not
  *deciding the other feature's design*.

## #941's required pre-implementation decisions (proposed defaults)

The issue lists these as decisions to document before implementation. The
following are proposed defaults, chosen to match the issue's own stated
scope ("opt-in/test-delivery infrastructure only," "administrator-only test
notification," "no general broadcast composer") — **flagged for your
confirmation, not treated as settled**, since several carry real user-privacy
and retention consequences:

| Question | Proposed default | Rationale |
| --- | --- | --- |
| Anonymous vs. authenticated subscriptions | Authenticated only (admin/volunteer accounts) | The issue scopes this to admin test-sends only; there's no public broadcast feature to justify anonymous subscriptions yet |
| Account vs. device scope | Per-device | A push subscription is inherently tied to a browser/device endpoint; per-account fan-out to all of a user's devices can be layered on later without a schema change |
| Categories/defaults | Single category ("system test"), default off | Matches "administrator-only test notification"; no per-event categories exist to subscribe to yet |
| Event-specific subscriptions | Not implemented in this phase | No event-scoped notification content exists yet to subscribe to |
| Retention | Subscription rows retained until explicit unsubscribe or a 404/410 push response retires them | Matches the issue's own "retire subscriptions on 404/410" requirement; avoids inventing a separate TTL |
| Browser/iOS expectations | Document that iOS Safari requires the PWA to be installed to the home screen for Web Push (a platform constraint, not a choice) | Factual constraint, not a design decision |
| Future Android boundary | Out of scope — the existing native Android app has its own notification channel | Avoids conflating browser push with the native app's FCM/notification path |
| GDPR/privacy consent language | Draft copy to be reviewed against `privacyPolicy.ts` and the site's actual legal basis before shipping | This is a legal/policy judgment call this document should not make unilaterally |

## What remains before #941 can be implemented

1. Confirmation (or correction) of the defaults above from the project
   owner.
2. The Redis-backed rate limiter from
   [`docs/decisions/932-multi-worker-state.md`](./932-multi-worker-state.md),
   at least for the subscription-mutation and test-send endpoints (or an
   explicit acceptance of single-worker deployment for that low-volume path
   in the interim).
3. Actual GDPR/consent copy, reviewed the same way `privacy_camera_title` /
   `privacy_camera_content` were added to `privacyPolicy.ts`.

## References

- [#937](https://github.com/tjorim/champagnefestival/issues/937) — offline
  web check-in (scanner + banner shipped; offline queue/precache pending)
- [#941](https://github.com/tjorim/champagnefestival/issues/941) — Web
  Push/VAPID subscription foundation
- [#947](https://github.com/tjorim/champagnefestival/issues/947) — durable
  outbox (closed; #941 may use it for admin test-push delivery)
- `docs/product-audit-2026-08.md` — cross-cutting service-worker note
- `frontend/src/config/privacyPolicy.ts` — existing consent-copy pattern
