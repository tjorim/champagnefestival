# Exhibitor manager passwordless login (#1192)

Decided and implemented 2026-10-07. One contact person manages each exhibitor;
a person may manage several exhibitors. There is no manager join table or
OIDC role. This increment is read-only; proposed edits remain in #1193.

Dedicated `exhibitor_manager_magic_links` and `exhibitor_manager_sessions`
tables and an `exhibitor_manager_session` HttpOnly, SameSite=Lax cookie keep
credentials separate from visitors and staff. Tokens and opaque session IDs
are stored only as SHA-256 hashes. Production cookies are Secure. Links use
the configured guest-link TTL; sessions have a seven-day sliding idle timeout
and a fixed thirty-day cap. Daily housekeeping removes expired credentials.

`get_current_exhibitor_manager` accepts only this cookie. It proves control of
a normalised email, without creating a visitor User or claiming bookings.
Each `GET /api/me/exhibitors` joins the current exhibitor contact to Person
and compares trimmed, lower-case email. Replacing/clearing the contact or
changing their email therefore revokes access on the next request. Empty
results are valid; session status reports email authentication, not a stored
manager role. No other API dependency accepts this session.

Requests are IP rate limited in their own scope, with the same 202 payload
for known and unknown contacts. Only current contacts receive mail. A new
request replaces the outstanding link; row locking makes redemption single
use. Email delivery is best effort, as in visitor login. The page at
`/my-exhibitors` removes the token from history before redemption and never
automatically retries writes. Session status and personal lists are no-store.
The admin exhibitor form explains that contacts need an email to log in.

Regression tests cover enumeration-resistant responses, rate limiting,
normalised matching, list ownership and revocation, hashed credentials,
replay, concurrent redemption, expiry, replaced links, sign-out, cleanup,
delivery failure, contacts without email and isolation from visitor/staff auth.
