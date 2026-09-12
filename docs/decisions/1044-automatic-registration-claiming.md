# Automatic registration claiming for a verified OIDC email

**Status:** Implemented (2026-09-12).
**Date:** 2026-09-12
**Issue:** [#1044](https://github.com/tjorim/champagnefestival/issues/1044)
**Related:** [#953](./953-visitor-passwordless-session.md) (the claim mechanism this
reuses); [Unified self-service page](./unified-self-service-page.md) (added the
manual claim UI this decision narrows)

---

## Context

PR #1037 added a "Have a booking under a different email? Claim it" link to
`/me`'s Registrations tab, giving a signed-in member/volunteer a UI path to
`POST /api/me/registrations/claim` — proving control of an email to attach any
matching unowned booking to their account. It required typing an email into a
form even though the caller was already signed in.

That framing conflated two different situations under one "different email"
label:

1. **The common case:** a booking made with the same email the person always
   uses, just while they weren't signed in at the time. Every booking
   collects an email regardless of auth state (`Registration.user_id` is
   `NULL` for "not linked to a user yet", never "no email on file") — so an
   unowned registration under an OIDC account's own email is virtually always
   the *same person*, not a separate identity to prove.
2. **The genuine edge case:** a booking placed under an email that isn't the
   signed-in account's own — booked by someone else, or an address no longer
   used to sign in. This one does need proof, since the app has no other way
   to know that inbox belongs to the caller.

Asking every signed-in user to manually retype an email for case 1 — when the
OIDC token already carries one — was the actual source of the confusion, and
is exactly the question #1044 left open: *"whether registration-claiming for
an already-authenticated OIDC user should happen automatically (trusting
Keycloak's `email_verified` claim, if the realm actually sets it)."*

## Decision — trust `email_verified: true`, claim automatically

**`app.visitor_session.get_current_user`** — the shared identity-resolution
dependency behind every `/api/me/*` handler — now calls
`claim_unowned_registrations_for_email` with the token's own `email` claim
whenever the token also carries `email_verified: true`, immediately after
resolving the caller's `User` row, before returning it. No new endpoint, no
frontend change: a signed-in member/volunteer's already-unowned bookings
under their own verified email are attached the moment they hit any
`/api/me/*` request (in practice, the first `GET /api/me/registrations` after
sign-in), the same convergent, existing-owner-protected write the manual
claim flow already used (`claim_unowned_registrations_for_email`, unchanged).

**Why `email_verified` is the right bar, not just the presence of an `email`
claim:** an unverified email is self-asserted (case in point: a
self-registered account under the phased plan in
[`tjorim/apps#197`](https://github.com/tjorim/apps/issues/197), which may
have no verified email at all pre-SMTP) — auto-claiming against it would
reintroduce exactly the "prove nothing, get someone else's booking" gap
Decision 1 in
[`1006-volunteer-identity-self-service.md`](./1006-volunteer-identity-self-service.md)
closed for volunteer identity. `email_verified: true` is Keycloak's own
attestation, not this app's; when it's absent or false, auto-claim silently
does nothing and the manual form remains the fallback.

**The manual claim form is kept, narrowed to case 2 only.** It's no longer
the only way to attach a booking made while signed out — just the way to
attach one made under a genuinely different email than the account's own.

## What this does not do

- No change to `POST /api/me/registrations/claim` itself, or to its
  retry-safety characterization — the one-shot lookup token it consumes is
  still not retry-safe with the same token, unchanged from the existing
  entry in `docs/retry-safety.md`.
- No re-verification of `email_verified` beyond trusting the token at request
  time — if a realm ever sets it `true` incorrectly, that is a realm
  configuration bug, not something this app can independently audit.
- No behavior change for visitor magic-link sessions — those already claim by
  construction (the redeemed link itself is the proof), independent of this
  OIDC-specific path.

## Retry-safety

See the new row in [`docs/retry-safety.md`](../retry-safety.md): convergent,
safe to blindly retry, no dedup needed — the same existing-owner-protected
write as the manual claim, just triggered automatically instead of via an
explicit request.

## References

- [Visitor passwordless session](./953-visitor-passwordless-session.md) —
  origin of `claim_unowned_registrations_for_email` and its
  existing-owner-protection guarantee
- [Unified self-service page](./unified-self-service-page.md) — added the
  manual claim UI this decision narrows to the genuine-different-email case
- [Retry-safety inventory](../retry-safety.md)
