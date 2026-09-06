# Visitor passwordless magic-link session

**Status:** Session mechanism and lifetime proposed, pending owner confirmation
before implementation starts.
**Date:** 2026-09-06
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

## Decision 1 — extend `User`, don't invent a parallel identity model

**Proposed: `User.oidc_subject` becomes nullable, add `User.verified_email:
str | None` (unique, nullable), with a check constraint that exactly one of
the two is set.**

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

## Decision 2 — two lifetimes, not one: a short link, a long session

This is the question the "check before the coast weekend" scenario is
actually about, and it's two separate numbers that #953's acceptance
criteria list under one heading ("short-lived, single-use" tokens, plus "the
visitor can sign out and clearly see when their session expires").
Conflating them is what would make the persistent session accidentally as
short-lived as a login link.

**The magic link itself — proposed 30 minutes, single-use, matching the
existing precedent.** This is a credential sent over email; the shorter it
lives, the smaller the window in which a compromised inbox or a forwarded
email grants access. `settings.guest_access_token_ttl_minutes` already
establishes 30 minutes as this project's answer to "how long should an
emailed access credential live," for the same reason, in the existing
one-shot lookup. No reason to pick a different number for a structurally
identical credential.

**The session established after redemption — proposed a sliding 30-day idle
window with a 180-day hard cap.** This is the number that actually answers
the motivating question: checking an order today and again in three weeks
must not require a fresh email each time, so the session must outlive the
gap between visits, not just the redemption moment.

- **Idle timeout (30 days):** each visit resets the clock, so a visitor who
  checks in every few weeks — exactly the "book, then check before a
  weekend trip" pattern — never sees a lapsed session. `worktime`'s Keycloak
  realm sets an analogous idle/max split for staff (`sso_session_idle_timeout:
  604800` / 7 days, `sso_session_max_lifespan: 2592000` / 30 days, in
  `tjorim/apps`'s `ansible/playbooks/keycloak.yml`) for the same reason:
  bound how long a session can go unused before it's worth re-verifying,
  without punishing someone who's actually using the thing regularly.
- **Hard cap (180 days):** regardless of activity, the session dies after six
  months, so a stolen or forgotten session token cannot grant access
  indefinitely just because someone keeps visiting. Six months rather than
  worktime's 30 days because the two have different threat models: a
  visitor's session grants read access to their own order history and a
  narrow set of self-service writes (communication preference, account
  deletion — see Decision 3's scope limit), not the admin/volunteer
  operational surface worktime's staff sessions guard. A once-a-season
  visitor (the festival runs annually) plausibly wants to check something six
  months out; a shorter cap would make the "long-lived, no re-verification
  hassle" property this document is solving for disappear for exactly the
  visitor who registers once a year and doesn't return to the site until the
  next one.
- **Recovery when either boundary is hit:** request a new magic link — same
  generic, non-enumerating flow as first sign-in. #953's acceptance criteria
  already require this ("expiry has a clear recovery path"); this document
  proposes that the recovery path is simply the same entry point, not a
  distinct "renew" flow.

**These two numbers — 30 minutes and 30/180 days — are exactly the kind of
business judgment call this project has consistently sent to the owner for
confirmation rather than picking silently (see #934's retention windows,
#932's rate-limit buckets). Flagged here on the same basis, not treated as
settled.**

## Decision 3 — session delivery: an HttpOnly cookie, not a bearer token in `localStorage`

**Proposed: the visitor session is an `HttpOnly`, `Secure`, `SameSite=Lax`
cookie holding an opaque, server-stored session ID — not a JWT the frontend
attaches as a Bearer header.**

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

Per #953 and `docs/product-audit-2026-08.md`'s existing Phase 6 note, the
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

## What remains before implementation starts

1. Confirmation (or correction) of the two proposed lifetimes: the 30-minute
   magic link, and the 30-day idle / 180-day hard-cap visitor session.
2. Confirmation of the `User` schema extension (nullable `oidc_subject`,
   new `verified_email`) versus the rejected parallel-table alternative.
3. Confirmation of cookie-based, server-stored sessions over a
   frontend-held JWT, given the precedent this deliberately departs from.
4. Once confirmed: implement the migration, `visitor_sessions` table, the
   shared caller-resolution dependency, the magic-link request/redemption
   endpoints, the session-refresh/sign-out endpoints, the frontend "My
   orders" flow and its states (per #953's acceptance criteria), the two new
   `docs/retry-safety.md` entries, and update
   `docs/product-audit-2026-08.md`'s #953 row per that document's
   maintenance procedure — with the navigation entry itself left disabled
   until production email delivery is verified end to end.

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
  (that one is deliberately session-less)
- `tjorim/apps`'s `ansible/playbooks/keycloak.yml` — confirms
  `registration_allowed: false` on the `champagnefestival` realm (visitors
  cannot self-register via OIDC, which is why this document exists) and the
  `worktime` realm's idle/max session split this document's Decision 2
  follows the shape of
- `docs/retry-safety.md` — inventory this document's new writes must join
