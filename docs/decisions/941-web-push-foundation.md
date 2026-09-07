# Service-worker ownership and Web Push subscription foundation

**Status:** Decided — the project owner confirmed all pre-implementation
questions on 2026-09-07 (see "Confirmed decisions" below), correcting one
proposed default in the process: subscriptions are **anonymous and public**,
not authenticated-only — "administrator-only" in the issue describes who can
*trigger* a send (the admin test-send button), not who can *subscribe* to
receive one. Ready to implement.
**Date:** 2026-09-03 (updated 2026-09-05, confirmed 2026-09-07)
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
2. Rate limiting for the subscription-mutation endpoints
   (subscribe/unsubscribe): now that subscriptions are anonymous and public
   (corrected above), these are public unauthenticated write endpoints in
   the same abuse-sensitive category check-in's own limiter covers per
   [`docs/decisions/932-multi-worker-state.md`](./932-multi-worker-state.md)
   decision 1 — implementation should extend `check_rate_limit_pg` to a new
   scope for them rather than the in-process `check_rate_limit`, since #932
   already shipped the Postgres-backed counter. The admin test-send endpoint
   is lower-volume and authenticated; the in-process limiter is an
   acceptable choice there, consistent with #932's own narrower scope.
3. Actual GDPR/consent copy, reviewed the same way `privacy_camera_title` /
   `privacy_camera_content` were added to `privacyPolicy.ts` — Claude drafts
   during implementation, project owner reviews (see table above).

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
