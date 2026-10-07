# Confirm-first registration claiming (#1044)

An OIDC account can claim unowned bookings under its own verified email only.
Previewing matching bookings does not change ownership; explicit confirmation is
required. This keeps linking visible to the person whose account changes.

## API and interaction

- `GET /api/me/registrations/claimable` returns matching unowned bookings without
  linking them. An absent or unverified email yields an empty list.
- `POST /api/me/registrations/claim-verified-email` links them after confirmation;
  it requires a nonempty email and boolean `email_verified: true`, otherwise 409.
  The shared ownership service never overwrites another account's ownership.

The Registrations tab shows **Confirm** and **Not now** when matches exist.
Only Confirm writes. Not now hides the prompt for the current page load; no
server-side dismissal is stored. Confirmation emails for unowned bookings link
to `/me` to make this flow discoverable, without granting access themselves.
The identity provider must verify the email; the application cannot establish
inbox control from an unverified claim. There is no different-email claim flow.

## Administrator assignment

`POST /api/registrations/{id}/assign-volunteer` accepts `volunteer_id` and requires
an administrator. The volunteer must have a linked `Person.oidc_subject` (else 422)
and the booking must be unowned (else 409). It resolves the volunteer's User and
records `registration_assigned`. There is no corresponding member assignment
without an admin-visible identity link.

Email-session redemption claims the address proven by its magic link. Signed-in
booking creation assigns ownership directly. These paths share the same
existing-owner protection; see [visitor sessions](953-visitor-passwordless-session.md)
and [retry safety](../retry-safety.md) for write and replay contracts.
