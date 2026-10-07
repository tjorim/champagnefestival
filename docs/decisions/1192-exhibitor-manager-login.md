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
cookie or a valid OIDC bearer token and resolves its verified email. For OIDC,
`email_verified` must be the boolean `true`; usernames and unverified email
claims never grant contact access. Each `GET /api/me/exhibitors` joins
the current exhibitor contact to Person and compares trimmed, lower-case
email. Replacing/clearing the contact or changing their email removes access
on the next request without signing them out of their other account data.
There is no stored manager role or separate identity model. A Keycloak
account with a verified matching email sees its exhibitors alongside its
role-based sections. Accounts without verified email see no exhibitors.
Email sessions never satisfy staff or volunteer dependencies. When both
credentials are present, the OIDC identity takes precedence; it cannot borrow
contact access from a different cookie identity.

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
OIDC account and volunteer sections remain role dependent. Exhibitor queries
send the same OIDC bearer token and scope their cache by provider subject.

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

## Both sign-in methods for one account — follow-up #1209

The owner confirmed on 2026-10-07 that password login and magic links should
both remain available for the same account, including staff and volunteers.
That broader requirement is tracked in [#1209](https://github.com/tjorim/champagnefestival/issues/1209).
The app now accepts a Keycloak-verified email for contact access. This is
compatibility work, not delivery of the universal account model.

The infrastructure already prepares a Keycloak magic-link alternative beside
password login (`tjorim/apps`, `ansible/playbooks/keycloak.yml`, apps#196),
but its flow remains inactive pending Keycloak email delivery. Both Keycloak
methods naturally produce the same `sub` and roles. Existing app email accounts
still have separate User identities; linking/migration, registration policy,
one coherent entry point and end-to-end sign-out need the cross-repository
follow-up. No local role cache or account merging is introduced here.
