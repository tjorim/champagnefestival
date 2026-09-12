# Visitor passwordless magic-link session

**Status:** Implemented (2026-09-07) — see "Implemented" below. The confirmed
calls: extend `User` with a nullable `verified_email` rather than a parallel
identity model; a 30-minute single-use magic link; a **7-day idle / 30-day
hard-cap** visitor session (tighter than this document's original
30-day/180-day proposal — see Decision 2); and an `HttpOnly` server-stored
session cookie rather than a frontend-held JWT. One acceptance criterion is
deliberately still undone: the public navigation entry, gated on verified
production email delivery per #953's own text.
Later extended (2026-09-12, PR #1037): `/my-registrations` — the page this
document built its UI on — was folded into the unified `/me` page (see
[`unified-self-service-page.md`](./unified-self-service-page.md)), and
claiming for an OIDC caller was split into a confirm-first flow for the
caller's own verified email plus this document's original manual/proof-token
flow for a genuinely different one (see
[`1044-confirm-first-registration-claiming.md`](./1044-confirm-first-registration-claiming.md)).
Nothing below about the magic-link/visitor-session mechanism itself changed —
only the page it lives on and how an OIDC caller's *own* claiming got easier.
**Date:** 2026-09-06 (confirmed same day, implemented 2026-09-07)
**Issues:** [#953](https://github.com/tjorim/champagnefestival/issues/953)
(primary); [#922](https://github.com/tjorim/champagnefestival/issues/922)
(registration ownership — the read model this reuses); [#924](https://github.com/tjorim/champagnefestival/issues/924),
[#947](https://github.com/tjorim/champagnefestival/issues/947) (transactional
email — code complete, production delivery not yet verified)

---

## Context

#953 asks for a way for ordinary visitors to see their current and past
registrations without a staff-style account. Today that's not possible even
in principle: every `/api/me/*` endpoint resolves the caller through
`get_or_create_user(db, claims["sub"])` (`backend/app/routers/me.py`), where
`claims["sub"]` is an OIDC subject — and the Keycloak `champagnefestival`
realm has `registration_allowed: false` (confirmed directly in
`tjorim/apps`'s `ansible/playbooks/keycloak.yml`), so a visitor cannot obtain
an OIDC account to begin with. `#953`'s own text already states this
correctly: *"the existing `/me` route is direct-link-only, immediately starts
the staff-oriented OIDC flow."* This document proposes the passwordless
mechanism that replaces it for visitors, without changing staff OIDC login at
all.

This was raised alongside a concrete scenario worth designing against
explicitly: a visitor who wants to check their order well *before* an event —
days or weeks ahead, e.g. before leaving for a weekend away — not only in the
few minutes after registering. The existing one-shot lookup
(`POST /api/registrations/my/request` + `/my/access`) cannot serve that: its
token is single-use and expires it immediately on redemption
(`token_row.expires_at = datetime.now(UTC)` in `registrations.py`), by
design, so it cannot become the kind of session #953 asks for. Nothing about
that one-shot flow is wrong — it does what it was built to do, cheaply, with
no persistent state — but it is not the persistent session #953 needs. That
gap, and the reasoning below, follow the pattern of
[`932-multi-worker-state.md`](./932-multi-worker-state.md),
[`934-data-retention-and-erasure.md`](./934-data-retention-and-erasure.md),
[`941-web-push-foundation.md`](./941-web-push-foundation.md), and
[`992-live-public-render.md`](./992-live-public-render.md): concrete
defaults, flagged for confirmation rather than treated as settled.

## Decision 1 — extend `User`, don't invent a parallel identity model (confirmed)

**Confirmed by the project owner on 2026-09-06: `User.oidc_subject` becomes
nullable, add `User.verified_email: str | None` (unique, nullable), with a
check constraint that exactly one of the two is set.**

`Registration.user_id` already points at `User`, and every `/me` read
(`_registrations_for_user`, `list_my_registrations`,
`get_communication_preference`) and the claim flow
(`claim_my_registrations`) work purely in terms of `user.id` — none of that
logic cares *how* the caller proved who they are. The only OIDC-specific part
is the one line that resolves `claims["sub"]` into a `User` at the top of
each handler. That is exactly the seam to extend, not replace:

- A magic-link redemption calls a new `get_or_create_user_by_email(db,
  verified_email)`, mirroring the existing `get_or_create_user(db,
  oidc_subject)` — same table, same `registrations` relationship, same
  `_user_people` helper.
- A new FastAPI dependency resolves the caller's `User` from *either* an OIDC
  bearer token *or* a visitor-session token (Decision 2), and every existing
  `/me` handler swaps `get_or_create_user(db, claims["sub"])` for it. The
  business logic underneath does not change.
- This is also why `claim_my_registrations`' existing shape survives
  unchanged: a visitor session already *is* proof of email control (Decision
  2 requires the magic link to be redeemed before the session exists), so
  claiming unowned registrations by email is the same operation it already
  is for an OIDC user who separately proves email control via the one-shot
  lookup token.

**Rejected alternative: a parallel `VisitorIdentity`/`VisitorSession` table
with its own read paths.** It avoids touching `User`, but duplicates
`_registrations_for_user` and the claim logic for no benefit — the whole
point of #922's ownership model is that "who owns this registration" has one
answer (`Registration.user_id`) regardless of how the owner authenticated.
Splitting that into two tables reintroduces exactly the two-source-of-truth
problem #922 exists to remove upstream of it.

## Decision 2 — two lifetimes, not one: a short link, a long session (confirmed)

This is the question the "check before the coast weekend" scenario is
actually about, and it's two separate numbers that #953's acceptance
criteria list under one heading ("short-lived, single-use" tokens, plus "the
visitor can sign out and clearly see when their session expires").
Conflating them is what would make the persistent session accidentally as
short-lived as a login link.

**The magic link itself — confirmed at 30 minutes, single-use, matching the
existing precedent.** This is a credential sent over email; the shorter it
lives, the smaller the window in which a compromised inbox or a forwarded
email grants access. `settings.guest_access_token_ttl_minutes` already
establishes 30 minutes as this project's answer to "how long should an
emailed access credential live," for the same reason, in the existing
one-shot lookup. No reason to pick a different number for a structurally
identical credential.

**The session established after redemption — confirmed at a sliding 7-day
idle window with a 30-day hard cap.** This is the number that actually
answers the motivating question: checking an order today and again in a
week or two must not require a fresh email each time, so the session must
outlive the gap between visits, not just the redemption moment.

- **Idle timeout (7 days):** each visit resets the clock, so a visitor who
  checks in every week or so never sees a lapsed session.
- **Hard cap (30 days):** regardless of activity, the session dies after a
  month, so a stolen or forgotten session token cannot grant access
  indefinitely just because someone keeps visiting.
- **Confirmed over this document's original proposal (30-day idle / 180-day
  hard cap):** the project owner chose to match `worktime`'s existing
  Keycloak realm precedent exactly (`sso_session_idle_timeout: 604800` / 7
  days, `sso_session_max_lifespan: 2592000` / 30 days, in `tjorim/apps`'s
  `ansible/playbooks/keycloak.yml`) rather than the longer, differently-sized
  cap this document argued for on the basis of the visitor session's
  narrower threat model (read access to one's own order history, not the
  staff operational surface). Worth flagging plainly for a future reader:
  under this confirmed number, a visitor who registers once and does not
  return to the site for more than a month between visits — plausible for
  an annual event — will need a fresh magic link even if they're well within
  the "days or weeks ahead" scenario that motivated this document, just not
  within 30 days of it. That's an accepted trade for consistency with the
  organization's existing session-length posture, not an oversight.
- **Recovery when either boundary is hit:** request a new magic link — same
  generic, non-enumerating flow as first sign-in. #953's acceptance criteria
  already require this ("expiry has a clear recovery path"); this document
  proposes that the recovery path is simply the same entry point, not a
  distinct "renew" flow.

## Decision 3 — session delivery: an HttpOnly cookie, not a bearer token in `localStorage` (confirmed)

**Confirmed by the project owner on 2026-09-06: the visitor session is an
`HttpOnly`, `Secure`, `SameSite=Lax` cookie holding an opaque, server-stored
session ID — not a JWT the frontend attaches as a Bearer header.**

This deliberately departs from how staff OIDC tokens are handled today
(`WebStorageStateStore` over `localStorage`, attached as a header via
`authHeaders()`). That precedent is a reasonable choice for OIDC access
tokens, which are short-lived and constantly refreshed by
`automaticSilentRenew`; it is a worse one for a token designed to live for
up to 180 days, since anything reachable from JavaScript is reachable by any
successful XSS on the page it's used from. An `HttpOnly` cookie removes that
exposure entirely for the one credential in this system with the longest
life span. The public site and its API already share a scheme/host
relationship that makes a first-party cookie viable (no cross-site
complications to design around).

Server-side, the cookie value indexes a `visitor_sessions` row (id, `user_id`,
`created_at`, `last_seen_at`, `expires_at`) rather than encoding claims in a
signed token — a database-backed session, not a stateless JWT. This makes
Decision 2's sliding idle window trivial to implement (update `last_seen_at`
and extend `expires_at` on use) and makes sign-out and the hard cap simple
row operations (delete the row; a background sweep removes rows past
`expires_at`), rather than requiring token revocation infrastructure a
stateless JWT would need to support the same properties. This mirrors
`reservation_access_tokens`' own shape (a row per credential, looked up by
hash, cleaned up on expiry) rather than introducing a new pattern.

**Scope limit, enforced structurally, not just by convention:** the FastAPI
dependency that resolves a visitor-session cookie must be a distinct
dependency from `require_admin`/`require_volunteer`/`get_current_claims`,
never merged into one "accept either" checker for those routes. #953's
acceptance criteria require that a visitor session "cannot access staff,
admin, integration, or Pebble credential-management APIs" — the cleanest way
to guarantee that is that those routers' dependencies simply never look for
this cookie at all, so there is no code path in which a visitor session could
satisfy them, rather than a runtime role check that could be gotten wrong.

## Decision 4 — this needs no coordination with #932

Worth stating explicitly given #932 is in flight: `visitor_sessions` is
plain row storage, read and written per-request like any other table — it
carries none of the in-memory, per-worker state #932 exists to fix (compare
the rate limiter or live bus, which hold state in the process itself). It
does not need to wait for #932's multi-worker decisions, and single- vs.
multi-worker deployment makes no difference to it.

## What email delivery status does and doesn't block

Per #953 and `docs/product-audit-2026-08.md`'s active acceptance gates, the
**navigation entry** (making "My orders" publicly discoverable) stays gated
behind verified end-to-end production email delivery — advertising a
sign-in flow that can't actually deliver its login link would be worse than
not offering it. Nothing else here waits on that:

- The schema change (Decision 1), the session table and cookie mechanism
  (Decisions 2–3), and every backend endpoint can be built and tested against
  the existing (working, just not production-verified) transactional email
  code path from #924/#947.
- The magic-link *request* endpoint itself doesn't need to change behaviour
  based on delivery status — same non-enumerating response either way, per
  #953's acceptance criteria — it only needs delivery to actually work by the
  time the feature is advertised.

## Retry-safety (to formalise at implementation time, per `AGENTS.md`)

Two new writes join the existing table
(`POST /api/registrations/my/access` and `POST /api/me/registrations/claim`
are already documented there):

- **Magic-link request** — same shape as the existing guest-access-token
  request: not retry-safe with the same token, generic response regardless
  of match, rate-limited by the requesting IP.
- **Magic-link redemption (session creation)** — not retry-safe with the same
  link, for the same reason the existing one-shot exchange isn't: the link is
  consumed atomically with session creation. An ambiguous response requires
  requesting a new link, not replaying the redeemed one.
- **Session refresh (sliding idle extension)** — convergent: extending
  `expires_at` on an already-valid session is idempotent, so this one *is*
  safe to retry, unlike the two above. Worth documenting as the positive
  example alongside them.

## Confirmed decisions

Every question this document raised was answered by the project owner on
2026-09-06. Nothing here is still waiting on an answer.

| Question | Decision |
| --- | --- |
| `User` identity model | **Extend `User`** with a nullable `verified_email` alongside its existing nullable `oidc_subject`, rather than a separate `VisitorIdentity` table |
| Magic-link lifetime | **30 minutes**, single-use — matches the existing guest-access-token precedent |
| Visitor session lifetime | **7-day idle / 30-day hard cap** — matches `worktime`'s existing Keycloak realm precedent exactly, in place of this document's original 30-day/180-day proposal (see Decision 2 for the accepted trade-off) |
| Session delivery | **`HttpOnly` server-stored cookie**, not a frontend-held JWT |

## What implementation covers

1. The migration: `User.oidc_subject` becomes nullable, add
   `User.verified_email` with its uniqueness and check constraints, and the
   new `visitor_sessions` table (id, `user_id`, `created_at`,
   `last_seen_at`, `expires_at`).
2. The shared caller-resolution dependency that accepts either an OIDC
   bearer token or the visitor-session cookie and resolves both to the same
   `User.id`, replacing the OIDC-only resolution in every `/me` handler.
3. The magic-link request and redemption endpoints, rate-limited and
   non-enumerating like the existing guest-access-token flow.
4. Session-refresh (sliding idle extension) and sign-out endpoints.
5. The frontend "My orders" flow and its states, per #953's acceptance
   criteria — with the navigation entry itself left disabled until
   production email delivery is verified end to end.
6. Two new `docs/retry-safety.md` entries (magic-link request/redemption,
   not retry-safe with the same credential; session refresh, safely
   retryable) per `AGENTS.md`.
7. Updating `docs/product-audit-2026-08.md`'s #953 row per that document's
   maintenance procedure.

## Implemented

All seven items above shipped as proposed, with a few implementation-time
refinements worth recording:

- **The magic link is its own table, `visitor_magic_links`, not
  `reservation_access_tokens`.** The "What email delivery status does and
  doesn't block" section above and the References list already said this was
  the intent; worth confirming it's exactly what shipped — same shape (email
  unique, hashed token, TTL), separate table, so the existing one-shot lookup
  keeps its own single-use/session-less semantics undisturbed.
- **Claiming on redemption reuses the existing claim logic directly, not a
  second one-shot token.** Redeeming a magic link is already fresh proof of
  control over that email, so it calls a new shared
  `claim_unowned_registrations_for_email` (extracted from
  `claim_my_registrations`'s previously-inline logic) with the verified email
  directly — no separate lookup token required. `claim_my_registrations`
  itself is unchanged in *shape*: still requires a fresh one-shot token, now
  usable by either an OIDC caller or an already-signed-in visitor session to
  claim registrations under *any* email they can prove control of (their own
  or otherwise) — a visitor's own session already covers claiming their own
  email's registrations without that endpoint.
- **Audit actor for a visitor-session action is the opaque `User.id`, not the
  verified email**, with a new `auth_source == "visitor_session"` value
  (`app.visitor_session.actor_for_user`, documented in `AuditEntry.actor`'s
  docstring) — the same reasoning #934 applied to client-IP actors: an audit
  trail kept indefinitely shouldn't carry more PII than the existing actor
  vocabulary already does.
- **The frontend needed no new page.** `/my-registrations` already had the
  entire email-request/loading/error/results UI built for the one-shot guest
  lookup (#924-era work) — including order items, QR codes, payment/status
  badges, and calendar links. Implementation only added: a session-status
  check on mount so a returning visitor's cookie is tried before showing the
  email form, a sign-out control with an expiry date, and redemption now
  hitting `/api/visitor-sessions/redeem` (which establishes the session)
  instead of the one-shot `/api/registrations/my/access` for a non-OIDC
  caller. An OIDC-authenticated visitor to this page (unchanged) still goes
  through `requestRegistrationLookup` → `claimMyRegistrations`, unaffected.
  (`/my-registrations` itself was later removed and folded into `/me` — see
  the "Later extended" note above; the component and this description of its
  behavior otherwise still apply, just as `/me`'s Registrations tab.)
- **`GET /api/visitor-sessions/status` was added** beyond the doc's original
  four endpoints — a small, auth-optional "am I signed in, and until when"
  check that never 401s, used by the frontend's on-mount session detection
  and by the sign-out UI's expiry display. It piggybacks on the same sliding
  refresh every other authenticated call gets, so it doubles as the
  "session-refresh" endpoint item 4 above called for, rather than needing a
  separate no-op refresh route.
- **Left undone, matching #953's own gate:** the public navigation entry
  ("My orders" in `frontend/src/config/navigation.ts`) was not added —
  production transactional email delivery for #924/#947 is still
  unverified, and #953's acceptance criteria explicitly require verifying
  that first. The DB-stored privacy/account policy text (#944) also hasn't
  been republished to describe the new session mechanism — the same kind of
  legal-content edit #934 left for the project owner rather than
  auto-editing.
- **Not removed, out of scope:** the pre-existing one-shot
  `POST /api/registrations/my/access` (and its `/my/request` counterpart)
  stay in the backend. Nothing in the frontend calls them anymore, but
  removing a still-functioning, still-tested public API surface is a
  separate cleanup decision this document doesn't make.

## References

- [#953](https://github.com/tjorim/champagnefestival/issues/953) — the issue
  this document decides
- [#922](https://github.com/tjorim/champagnefestival/issues/922) — durable
  registration ownership; `Registration.user_id` and the read model this
  document reuses rather than duplicates
- [#924](https://github.com/tjorim/champagnefestival/issues/924),
  [#947](https://github.com/tjorim/champagnefestival/issues/947) —
  transactional email and the durable outbox; code complete, production
  delivery verification is the only remaining gate on the navigation entry
- `backend/app/routers/me.py` — `get_or_create_user`, `_user_people`,
  `_registrations_for_user`, `claim_my_registrations`, the seam Decision 1
  extends
- `backend/app/routers/registrations.py` — the existing one-shot
  `reservation_access_tokens` lookup this document's magic link reuses the
  TTL/single-use precedent from, without reusing the token table itself
- [Unified self-service page](./unified-self-service-page.md) — folded
  `/my-registrations` into `/me` (2026-09-12)
- [Confirm-first registration claiming](./1044-confirm-first-registration-claiming.md) —
  split OIDC claiming into a confirm-first flow for the caller's own verified
  email and this document's original manual/proof-token flow (2026-09-12)
  (that one is deliberately session-less)
- `tjorim/apps`'s `ansible/playbooks/keycloak.yml` — confirms
  `registration_allowed: false` on the `champagnefestival` realm (visitors
  cannot self-register via OIDC, which is why this document exists) and the
  `worktime` realm's idle/max session split this document's Decision 2
  follows the shape of
- `docs/retry-safety.md` — inventory this document's new writes must join
