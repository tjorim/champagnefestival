# Authorization model

Keycloak is the identity authority for the web app, Android app, and authenticated
MCP transport. Interactive clients use Authorization Code with PKCE. The backend
normalizes Keycloak claims into a principal containing subject, local user,
authorized client, authentication type, roles, and scopes.

The Pebble watch does not receive Keycloak refresh tokens. A signed-in user pairs
the watch by rotating a revocable `cfpat_` credential. That credential is stored
hashed and is accepted only by `/api/pebble/registrations`; administration,
account, volunteer, and MCP operations remain Keycloak-only.

Machine-to-machine MCP deployments should use a dedicated Keycloak confidential
client and service account with purpose-specific roles. They must not reuse a
human session or Pebble credential. MCP accepts both interactive user tokens and
client-credentials tokens; authorization is determined by the `volunteer` and
`admin` realm roles and the API audience, not by `offline_access`.

Use separate public Keycloak clients for web and Android. Both use Authorization
Code + PKCE, while separate client IDs keep redirect/logout URIs and audit
provenance distinct. The SPA renews tokens, monitors the Keycloak session,
revokes tokens on logout, and performs RP-initiated sign-out. Android now also
opens the Keycloak end-session endpoint before clearing encrypted local state.

Organization contacts and visitors share the passwordless emailed login (#1192),
described in the [login decision](decisions/1192-organization-manager-login.md).
An email session supplies its verified email; an OIDC sign-in supplies an
email only when the token explicitly contains `email_verified: true`. Both
are matched against the current contact person on every organization read. Authentication proves identity;
current records determine access. Email sessions never satisfy staff or
volunteer dependencies. A role alone grants no contact access. An OIDC
identity takes precedence over a simultaneous cookie identity. Keeping both
password and Keycloak magic-link login for one canonical account is the
cross-repository follow-up [#1209](https://github.com/tjorim/champagnefestival/issues/1209);
Keycloak email delivery/flow activation and existing email-account migration
remain outstanding.

## Linking people to accounts

`people` (the directory record) and `users` (the sign-in account) describe the
same human and are joined by one key, `people.user_id` (nullable, unique, set to
null when the account is deleted), maintained only by
`app/services/person_account.py`. "Which person is this account" has one answer,
`person_for_account`, used by volunteer self-service, linked attendance polls,
admin assignment of a booking to a volunteer and actor names. `people.oidc_subject`
no longer exists; the admin field of that name is the linked account's subject.

A link is written only from a verified identity:

- **OIDC subject:** the volunteer registering themselves with their own token
  ([#1006](decisions/1006-volunteer-identity-self-service.md)) or an administrator
  linking a volunteer. An account that already has a person, or a person that
  already has an account, is never taken over: 409 `person_account_conflict`.
- **Verified email:** a magic-link redemption or a token with
  `email_verified: true` links an account to the person holding that address only
  when the address belongs to **exactly one** non-anonymised person, that person
  is unlinked, and it has no national register or eID number and no volunteer
  role. A shared inbox or an unmerged duplicate is never guessed, and identity
  documents are reached only through the subject link. The write happens when the
  account confirms a booking claim
  ([#1044](decisions/1044-confirm-first-registration-claiming.md)) or redeems a
  magic link; the claim itself is unchanged and still confirm-first.
- An unverified or free-text address, a username or a service account never links.

Merging two people moves the duplicate's link to the survivor and refuses two
different accounts; anonymising a person removes its link.

Two decisions deliberately stay on the verified address rather than the link,
because they describe the address and not a person record: organisation manager
access (the verified address against the contact person's, re-read on every
request, [#1192](decisions/1192-organization-manager-login.md)) and the
current-member gate for members-only events and `/api/me/membership` (the
verified address against the unique current-member address). Both use the one
trimmed, case-insensitive address comparison in `person_account.email_matches`,
as do consent look-ups and the claimable-bookings preview.
