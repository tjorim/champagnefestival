# Confirm-first registration claiming for a verified OIDC email

**Status:** Implemented (2026-09-12, reworked from a silent-automatic design the same day).
**Date:** 2026-09-12
**Issue:** [#1044](https://github.com/tjorim/champagnefestival/issues/1044)
**Related:** [#953](./953-visitor-passwordless-session.md) (the claim mechanism this
reuses); [Unified self-service page](./unified-self-service-page.md) (added the
manual claim UI this decision narrows); [1006-volunteer-identity-self-service.md](./1006-volunteer-identity-self-service.md)
(the admin-override precedent the new admin action mirrors)

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

## First attempt, reverted the same day: claim silently, no confirmation

The first version of this decision had `app.visitor_session.get_current_user`
call `claim_unowned_registrations_for_email` with the token's own verified
email automatically, on every `/api/me/*` request — no UI, no confirmation,
just linked the moment a signed-in caller's own verified email matched an
unowned booking.

**Rejected on review as the wrong default**, even though the write itself is
safe (checksum-equivalent trust via `email_verified`, existing-owner-protected,
convergent): silently rewriting someone's account data — even correctly —
isn't something a verified-email match alone should justify without the
person seeing it happen first. "Provably safe" and "the caller was ever asked"
are different properties, and only the caller can confirm the first booking
under an email is actually theirs to add.

## Decision — preview, then require an explicit confirmation to link

**Two endpoints replace the single silent auto-claim, both behind
`app.visitor_session.get_current_user_with_claims`** (a new dependency
alongside `get_current_user`, returning the caller's `User` *and* their raw
OIDC claims — needed here to read the verified email without a second token
decode):

- `GET /api/me/registrations/claimable` — **read-only preview.** Returns
  unowned registrations matching the caller's own verified email. Nothing is
  linked.
- `POST /api/me/registrations/claim-verified-email` — **the actual link**,
  performed only when the frontend calls it after the caller clicks a
  confirm button. Same `claim_unowned_registrations_for_email` write as the
  manual token-based flow, just keyed by the token's own email instead of a
  mailed token's.

Both require `email_verified: true` on the caller's token — an unverified
email is self-asserted, not Keycloak's own attestation (the same trust bar
Decision 1 in `1006-volunteer-identity-self-service.md` uses for volunteer
identity), so `claimable` returns empty and `claim-verified-email` 409s
without one. The manual proof-token flow remains the fallback for a
genuinely different email.

**Frontend (`MyRegistrationsPage`):** fetches `claimable` once signed in;
when it returns a non-empty list, an "Is this you?" card appears above the
caller's own registrations with **Confirm** and **Not now** actions. Only
**Confirm** calls `claim-verified-email`; **Not now** just hides the card for
the current page load (no dismissal is persisted server-side — the card
reappears on a future visit if the booking is still unclaimed, since there's
nothing to remember: dismissing isn't a negative assertion that it isn't
theirs, just "not right now").

**Confirmation email note:** `send_registration_confirmation` now includes a
line inviting the recipient to sign in at `/me` and add the booking to their
account, shown only when `registration.user_id is None` (an already-owned
booking's confirmation has nothing to invite — the booker was signed in
already). The link is a plain `/me` URL, not a token or magic link: the
recipient still proves ownership by signing in and confirming the claimable
card, exactly the same way as the in-app path — the email exists to make the
in-app confirm-first flow discoverable, not to grant access itself.

**Admin override:** `POST /api/registrations/{id}/assign-volunteer`
(admin-only, body `{"volunteer_id": ...}`) attaches an unowned registration
to a volunteer's own portal account directly, for a booking they never
confirm themselves (an account they rarely sign into, or a booking that
predates their self-registration). Scoped to volunteers specifically because
that's the only entity an admin already has a resolvable OIDC identity for
(`Person.oidc_subject`, set at self-registration per #1006) — there's no
equivalent admin-visible link for a plain "member" account. Requires the
volunteer to already be linked (`oidc_subject is not None`, else 422) and the
registration to still be unowned (else 409, same existing-owner-protection as
every other claim path). Resolves/creates the volunteer's `User` row via
`get_or_create_user` and writes a `registration_assigned` audit entry.

## What this does not do

- No change to `POST /api/me/registrations/claim` itself, or to its
  retry-safety characterization — the one-shot lookup token it consumes is
  still not retry-safe with the same token, unchanged from the existing
  entry in `docs/retry-safety.md`.
- No persisted "dismissed" state for the claimable card — see above.
- No admin path for attaching a registration to a non-volunteer ("member")
  account — there's no admin-visible identity to resolve one from today.
- No re-verification of `email_verified` beyond trusting the token at request
  time — if a realm ever sets it `true` incorrectly, that is a realm
  configuration bug, not something this app can independently audit.
- No behavior change for visitor magic-link sessions — those already claim by
  construction (the redeemed link itself is the proof), independent of this
  OIDC-specific path.

## Retry-safety

See `docs/retry-safety.md`: `claim-verified-email` and the admin
assign-volunteer action are both convergent, existing-owner-protected writes
— safe to blindly retry, no dedup needed. `claimable` is a pure read.

## References

- [Visitor passwordless session](./953-visitor-passwordless-session.md) —
  origin of `claim_unowned_registrations_for_email` and its
  existing-owner-protection guarantee
- [Volunteer identity self-service](./1006-volunteer-identity-self-service.md) —
  the `oidc_subject`/admin-override precedent the assign-volunteer action mirrors
- [Unified self-service page](./unified-self-service-page.md) — added the
  manual claim UI this decision narrows to the genuine-different-email case
- [Retry-safety inventory](../retry-safety.md)
