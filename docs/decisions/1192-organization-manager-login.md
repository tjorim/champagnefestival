# Shared emailed account login and organization access (#1192)

One contact person manages each organization; a person may manage several.
A shared login opens `/me` with the data associated with the verified identity.
[Organization proposals](../organization-change-review.md) use the same identity.

## Authentication and authorisation

Reuse `VisitorMagicLink`, `VisitorSession`, the `visitor_session` cookie and
`/api/visitor-sessions/{request,redeem,status,sign-out}`. There is one magic link,
one cookie and one session lifecycle for email accounts. The normalised
`User.verified_email` is established by redeeming a link; OIDC users have an
OIDC subject instead of a verified email, enforced by the database constraint.

`get_organization_contact_email`, in the existing session module, accepts that
cookie or a valid OIDC bearer token and resolves its verified email. For OIDC,
`email_verified` must be the boolean `true`; usernames and unverified email
claims never grant contact access. Each `GET /api/me/organizations` joins
the current organization contact to Person and compares trimmed, lower-case
email. Replacing/clearing the contact or changing their email removes access
on the next request without signing them out of their other account data.
There is no stored manager role or separate identity model. A Keycloak
account with a verified matching email sees its organizations alongside its
role-based sections. Accounts without verified email see no organizations.
Email sessions never satisfy staff or volunteer dependencies. When both
credentials are present, the OIDC identity takes precedence; it cannot borrow
contact access from a different cookie identity.

The existing hashed credentials, configured single-use link TTL, HttpOnly
SameSite=Lax cookie (Secure in production), seven-day sliding idle timeout,
thirty-day hard cap, rate limit, generic 202 response and daily housekeeping
are retained. A valid unknown email can sign in and see an empty account;
requesting a link never discloses bookings or organization membership. A contact
without email cannot obtain organization access. No new authentication schema is needed for this login.

## Unified page

All email links use `/me?token=…`. The single existing request/redemption
flow removes the token before redemption and claims eligible unowned
bookings as before. The page shows the organization tab when the authenticated
email manages organizations. A contact with organizations and no bookings sees
the organization list directly; booking-only visitors see their bookings.
OIDC account and volunteer sections remain role dependent. Organization queries
send the same OIDC bearer token and scope their cache by provider subject.

One email sign-out clears both booking and organization views only after the
server confirms revocation. Failed sign-out retains the views and reports
an error. A session generation fences late callbacks and organization requests;
private organization queries have no retained cache across page instances.
Writes are not automatically retried; see the existing visitor write entries
and the #1192 extension in [retry safety](../retry-safety.md).

## Both sign-in methods for one account — follow-up #1209

Password and magic-link login for the same account, including staff and
volunteers, remains tracked in [#1209](https://github.com/tjorim/champagnefestival/issues/1209).
Matching verified emails grant organization contact access, but existing email
and OIDC accounts still have separate User identities. Account linking/migration,
registration policy, a coherent entry point and end-to-end sign-out require
cross-repository work with `tjorim/apps`; see the [active work](../product-audit-2026-08.md).
