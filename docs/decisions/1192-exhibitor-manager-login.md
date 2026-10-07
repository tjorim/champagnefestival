# Shared emailed account login and exhibitor access (#1192)

Decided and implemented 2026-10-07. One contact person manages each exhibitor;
a person may manage several exhibitors. One emailed login opens `/me` and
shows the information associated with the verified identity. This increment
is read-only; proposed exhibitor edits remain in #1193.

## Authentication and authorisation

Reuse `VisitorMagicLink`, `VisitorSession`, the `visitor_session` cookie and
`/api/visitor-sessions/{request,redeem,status,sign-out}`. These historical names
remain for compatibility with existing visitors. There is one magic link,
one cookie and one session lifecycle for email accounts. The normalised
`User.verified_email` is established by redeeming a link; OIDC users have an
OIDC subject instead of a verified email, enforced by the database constraint.

`get_current_exhibitor_manager`, in the existing session module, accepts that
cookie and resolves its verified email. Each `GET /api/me/exhibitors` joins
the current exhibitor contact to Person and compares trimmed, lower-case
email. Replacing/clearing the contact or changing their email removes access
on the next request without signing them out of their other account data.
There is no stored manager role or separate identity model. A staff bearer
token alone does not prove contact-email control; email sessions never satisfy
staff or volunteer dependencies.

The existing hashed credentials, configured single-use link TTL, HttpOnly
SameSite=Lax cookie (Secure in production), seven-day sliding idle timeout,
thirty-day hard cap, rate limit, generic 202 response and daily housekeeping
are retained. A valid unknown email can sign in and see an empty account;
requesting a link never discloses bookings or exhibitor membership. A contact
without email cannot obtain exhibitor access. No new schema is needed for
this login; migration 004 only adds exhibitor descriptions.

## Unified page

All email links use `/me?token=…`. The single existing request/redemption
flow removes the token before redemption and claims eligible unowned
bookings as before. The page shows the exhibitor tab when the authenticated
email manages exhibitors. A contact with exhibitors and no bookings sees
the exhibitor list directly; booking-only visitors see their bookings.
OIDC account and volunteer sections remain role dependent.

One email sign-out clears both booking and exhibitor views only after the
server confirms revocation. Failed sign-out retains the views and reports
an error. A session generation fences late callbacks and exhibitor requests;
private exhibitor queries have no retained cache across page instances.
Writes are not automatically retried; see the existing visitor write entries
and the #1192 extension in [retry safety](../retry-safety.md).

## Verification and superseded design

Tests cover one link/session unlocking both owned data sets, normalised
contact matching, live contact revocation, unknown/no-email contacts, shared
sign-out and separation from staff authentication. Existing visitor tests
cover hashing, expiry, replay, concurrent redemption, rate limiting and
cleanup. Frontend tests cover one request form, both data views, contacts
without bookings, visitors without exhibitors and failed sign-out.

The issue originally required that a visitor session never grant manager
access. The initial implementation therefore created separate manager tables,
endpoints and a cookie. The owner's clarification on 2026-10-07 superseded
that requirement: authentication should be shared and available information
should follow current identity and records. The separate lifecycle and
manager-specific token parameter were removed; the live contact check and
staff isolation remain. The issue body preserves the original specification
and records the revised contract in a headed design revision.
