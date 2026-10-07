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

Exhibitor contacts and visitors share the passwordless emailed login (#1192),
described in the [login decision](decisions/1192-exhibitor-manager-login.md).
An email session supplies its verified email; an OIDC sign-in supplies an
email only when the token explicitly contains `email_verified: true`. Both
are matched against the current contact person on every exhibitor read. Authentication proves identity;
current records determine access. Email sessions never satisfy staff or
volunteer dependencies. A role alone grants no contact access. An OIDC
identity takes precedence over a simultaneous cookie identity. Keeping both
password and Keycloak magic-link login for one canonical account is the
cross-repository follow-up [#1209](https://github.com/tjorim/champagnefestival/issues/1209);
Keycloak email delivery/flow activation and existing email-account migration
remain outstanding.
