# Confirm-first registration claiming for a verified OIDC email

**Status:** Implemented (2026-09-12, reworked from a silent-automatic design
the same day, then further narrowed the same day again to remove the manual
different-email claim flow entirely — see "Later change" below).
**Date:** 2026-09-12
**Issue:** [#1044](https://github.com/tjorim/champagnefestival/issues/1044)
**Related:** [#953](./953-visitor-passwordless-session.md) (the claim mechanism this
reuses); [Unified self-service page](./unified-self-service-page.md) (added, then
this decision's later change removed, the manual claim UI);
[1006-volunteer-identity-self-service.md](./1006-volunteer-identity-self-service.md)
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

> **Superseded the same day** — see "Later change: the manual
> different-email claim flow was removed entirely" below. There is no
> fallback for a genuinely different email anymore; that capability was
> removed rather than kept narrowed.

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

- No persisted "dismissed" state for the claimable card — see above.
- No admin path for attaching a registration to a non-volunteer ("member")
  account — there's no admin-visible identity to resolve one from today.
- No re-verification of `email_verified` beyond trusting the token at request
  time — if a realm ever sets it `true` incorrectly, that is a realm
  configuration bug, not something this app can independently audit.
- **No guarantee that real accounts actually carry `email_verified: true`.**
  Nothing in `tjorim/apps` sets it — volunteer/admin accounts on the
  `champagnefestival` realm are created manually through the Keycloak Admin
  Console, not by any script, so it depends entirely on whoever creates the
  account remembering to tick it. When it's unset, the feature doesn't error;
  the confirm-first prompt on `/me` just never appears, silently degrading to
  "always use the manual claim form." Tracked as
  [tjorim/apps#198](https://github.com/tjorim/apps/issues/198).
- No behavior change for visitor magic-link sessions — those already claim by
  construction (the redeemed link itself is the proof), independent of this
  OIDC-specific path.

## Later change (2026-09-12): the manual different-email claim flow was removed entirely

Review of this same PR raised the product question directly: should the app
ever support linking a booking made under someone else's email address onto
an account, given proof of control of that inbox? The answer was **no** —
*"one account per email, all orders grouped and linked there."* An account
should only ever gather bookings that were genuinely placed under its own
email, not bookings proven-by-mailed-token to belong to some other address
that happens not to be the account's own.

That retires the entire "genuinely different email" case (case 2 above), not
just the manual retyping UI for it. Removed:

- `POST /api/me/registrations/claim` and its router-level helpers
  (`claim_my_registrations` in `app/routers/me.py`).
- `POST /api/registrations/my/request` and `POST /api/registrations/my/access`
  (`app/routers/registrations.py`) — the emailed one-shot proof-token request/
  redeem pair those two endpoints and the manual claim shared.
- The `ReservationAccessToken` model and table (migration
  `003_drop_reservation_access_tokens`), and `send_guest_access_email`.
- The "Have a booking under a different email? Claim it" UI this decision's
  original text still described as the fallback, plus its
  `my_registrations_claim_*` translation strings.

What survives, and why each one still satisfies "one account per email"
without reintroducing the removed capability:

1. **Direct ownership at booking time** — `Registration.user_id` set when a
   signed-in caller books.
2. **Confirm-first claiming of the caller's own verified email**
   (`claimable`/`claim-verified-email`, this decision's core mechanism,
   unchanged) — only ever the caller's own OIDC-verified address.
3. **Visitor magic-link redemption** — claims only the email the link itself
   was sent to; the link's existence already proves control of that inbox as
   the caller's own.
4. **Admin assign-volunteer override** — not an email-control proof at all;
   an admin vouching for a volunteer's own already-linked identity.

`app.services.users_service.claim_unowned_registrations_for_email` — the
shared, existing-owner-protected write every surviving path above still calls
— is unchanged; only the callers that let it be invoked for an email other
than the caller's own were removed.

`docs/decisions/953-visitor-passwordless-session.md` and
`docs/product-audit-2026-08.md` are updated in the same change to drop their
now-stale descriptions of the removed flow.

## Retry-safety

See `docs/retry-safety.md`: `claim-verified-email` and the admin
assign-volunteer action are both convergent, existing-owner-protected writes
— safe to blindly retry, no dedup needed. `claimable` is a pure read. The
removed `claim`/`my/request`/`my/access` endpoints' retry-safety rows were
deleted along with them.

## References

- [Visitor passwordless session](./953-visitor-passwordless-session.md) —
  origin of `claim_unowned_registrations_for_email` and its
  existing-owner-protection guarantee
- [Volunteer identity self-service](./1006-volunteer-identity-self-service.md) —
  the `oidc_subject`/admin-override precedent the assign-volunteer action mirrors
- [Unified self-service page](./unified-self-service-page.md) — added the
  manual claim UI this decision's later change removed entirely
- [Retry-safety inventory](../retry-safety.md)
