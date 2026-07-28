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
