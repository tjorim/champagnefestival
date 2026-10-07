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

## Both sign-in methods for one account — #1209

The owner decision (2026-10-07) is that password login and magic links open
**one** account whose `/me` shows everything the person is entitled to. The
app side is implemented; production activation is not (see "Still open").

**Identity model.** `users` now requires *at least one* of `oidc_subject` and
`verified_email` (migration `005`, constraint `ck_users_has_identity`). Both set
means the Keycloak account and its verified address are one row. Roles are
never stored; staff and volunteer dependencies read only the bearer token, so
an emailed session can never satisfy them.

**Joining rules** (`users_service.resolve_oidc_user`, run when a bearer token is
resolved; only a boolean `email_verified: true` on a non-service-account token
counts):

| Situation | Result |
| --- | --- |
| New subject, an email-only user holds the address | The subject is attached to that user: id, bookings, sessions and audit history are kept |
| Subject and an email-only user both exist | Bookings and sessions move to the Keycloak user, the duplicate is deleted, `account_linked` is audited with the counts. Both identities proved the same address; registrations are never matched by email alone, and another user's bookings are never moved |
| Keycloak email changed | The stale address is released first (it reaches a fresh email-only account), then the new one is linked |
| Another Keycloak account already holds the address | Nothing is linked or transferred; the caller keeps their own account |
| Unverified, absent or service-account email | No link |

Concurrent first logins converge through row locks and unique-constraint
recovery. Existing emailed sessions survive linking until their normal
idle/hard-cap expiry.

**Transition: which emailed link is used.**

- An address *not* linked to a Keycloak account keeps today's app magic link
  (`/me?token=…`), which opens an email-only account.
- An address linked to a Keycloak account no longer receives an app link. The
  request still answers `202` identically, and the email says to use the
  account sign-in at `/me` (password, or Keycloak's own magic link once its
  SMTP is configured). A link issued before linking is refused on redemption.
  A staff user therefore never ends up with a roleless application session
  instead of the Keycloak account.
- The first Keycloak login with a verified email joins the accounts, so the
  link is created by signing in once, not by a separate step or admin action.

**Audit provenance** follows the sign-in method, not the account:
`actor_for_user(user, claims)` logs the OIDC subject for a bearer call and the
opaque user id with `visitor_session` for a cookie call.

**Sign-out.** `AuthContext.logout` revokes the emailed session on the server
first and only then clears cached views and redirects to the IdP; a failed
revocation keeps the views and shows an error. The `/me` button is the same for
both methods. The emailed-only button is unchanged.

**Deliberate limits.** Disabling a Keycloak account stops bearer access at once
but does not end an already-issued emailed session of the linked row (at most 30
days, no roles, bookings and organizations only); delete the row's sessions to
force it. Self-registration and "create nonexistent user" stay off.

**Rollback.** Migration `005` downgrade clears `verified_email` on every row
that has an OIDC subject (the address then signs in as a fresh email-only
account) before restoring the exactly-one constraint. Application rollback
before downgrading is safe: older code treats linked rows as OIDC users.

**Still open** (tracked on #1209): configure and verify Keycloak SMTP and
activate the prepared flow in `tjorim/apps`, then verify both complete browser
logins in production. Until then the issue stays open.
