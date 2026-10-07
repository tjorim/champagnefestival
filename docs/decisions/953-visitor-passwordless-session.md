# Visitor passwordless magic-link session (#953)

Implemented in PR #1012. Public navigation remains gated on verified production
email delivery; see the [active acceptance checks](../product-audit-2026-08.md).

## Identity and credentials

Email accounts use `User.verified_email`; OIDC accounts use `User.oidc_subject`.
Both fields are unique and nullable, with a constraint requiring exactly one.
Registration ownership uses `Registration.user_id` for either identity type.
Matching emails do not merge the two account records; account unification remains
[#1209](https://github.com/tjorim/champagnefestival/issues/1209).

Magic links are single-use credentials stored as hashes in `visitor_magic_links`,
with a configurable lifetime (default 30 minutes). Redemption atomically consumes
the link, establishes a database-backed session and claims eligible unowned
registrations for the verified email, without replacing another owner's claim.

The `visitor_session` cookie is opaque, HttpOnly and SameSite=Lax, with Secure
in production. Sessions have a sliding seven-day idle deadline and a thirty-day
hard cap. Expiry requires requesting a fresh link; sign-out revokes the server
session. Housekeeping removes expired credentials. Audit actors use the opaque
User ID rather than the email address.

## API and access

| Endpoint | Contract |
| --- | --- |
| `POST /api/visitor-sessions/request` | Rate-limited request; generic 202 for valid emails without disclosing bookings or organisation membership. |
| `POST /api/visitor-sessions/redeem` | Redeems a link and establishes the cookie session; invalid, expired or replayed links return 401. |
| `GET /api/visitor-sessions/status` | Reports authentication and expiry; responses are not cached. |
| `POST /api/visitor-sessions/sign-out` | Revokes the session and clears the cookie; repeat sign-out converges. |

The shared `/me` dependency accepts an OIDC bearer token or the email cookie;
OIDC takes precedence when both are present. Staff, admin, volunteer and integration
authorisation continue to require their OIDC dependencies. Email sessions do not
grant those roles. Current verified contacts can use the [organisation workflow](1192-organization-manager-login.md).

Links open `/me?token=…`; the frontend removes the token before redemption.
See the [unified page](unified-self-service-page.md), [OIDC booking confirmation](1044-confirm-first-registration-claiming.md)
and [retry-safety inventory](../retry-safety.md) for caller recovery rules.

## Production gate

- [ ] Verify transactional email delivery end to end.
- [ ] Enable localised public **My orders** navigation to `/me` after verification.
- [ ] Publish the corresponding privacy/account copy.
