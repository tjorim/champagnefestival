# Release validation: interactive client authentication

Manual, on-device validation of the login/logout paths that automated tests
cannot cover: the real Keycloak redirect flow on web, the browser/app handoff on
Android, and the configuration-webview-to-watch handoff on Pebble.

Tracks [issue #780](https://github.com/tjorim/champagnefestival/issues/780).
Run this against a deployed release; it complements the post-deploy checklist in
[`RELEASE-RUNBOOK.md`](../RELEASE-RUNBOOK.md), which covers admin login only as a
smoke test. See [`authorization-model.md`](authorization-model.md) for the model
these checks are validating.

## Ground rules

This exercises the production authorization stack. No compatibility fallbacks.

- **No dev bypass.** `DEV_AUTH_BYPASS_TOKEN` must be unset on the target
  environment. The backend refuses to start with it set outside
  `ENVIRONMENT=development`, so a running production API already implies this —
  confirm the environment you are pointing at is not a local dev stack.
- **Real IdP.** Every sign-in goes through the actual Keycloak realm, not a
  mock, a stub authority, or a pre-seeded token.
- **Separate clients.** Web and Android use separate public Keycloak client IDs.
  A run where both used the same client ID does not validate the model.
- **Record before you start.** Capture the version and client details in the
  results table below *first*, so a failure is attributable to a specific build.

Use a test account with the roles under test (`admin` and/or `volunteer`). Note
that signing out in one client does not necessarily end the Keycloak SSO session
for the others — run the three sections independently, in separate browser
profiles where practical.

## A. Web

Target: `https://champagnefestival.tjor.im`

### A1. Record the build

```bash
curl -sf https://champagnefestival.tjor.im/api/health | jq '.version'
```

- [ ] Version matches the release under validation (root `VERSION`).
- [ ] Record browser name + version and OS.

### A2. Sign in through the real Keycloak flow

1. Open `/admin` while signed out. Open devtools (Network, preserve log) before
   clicking anything.
2. Click **Login**.

- [ ] The browser is redirected to the Keycloak authority
      (`VITE_OIDC_AUTHORITY`), not to any local or mock issuer.
- [ ] The authorization request carries `code_challenge` and
      `code_challenge_method=S256` (Authorization Code + PKCE), and
      `client_id` is the **web** client.
- [ ] Keycloak presents a real credential prompt; complete it.
- [ ] The callback returns to `/admin` (or the `returnTo` route if you started
      from a deep link) and the admin dashboard renders.

### A3. Confirm authenticated app and API access

- [ ] Navigation reflects the account's realm roles — an `admin` account sees
      admin sections, a `volunteer`-only account does not.
- [ ] At least one authenticated API call returns **200** with an
      `Authorization: Bearer …` header (e.g. the dashboard's admin fetches, or
      `GET /api/me/registrations`).
- [ ] Copy the access token from a request header and save it for step A5.

### A4. Silent renewal holds the session

The SPA runs `automaticSilentRenew` and `monitorSession`.

- [ ] Leave the tab open past the access-token lifetime. The session renews
      without a full-page redirect and without an interaction prompt.
- [ ] No repeated silent-renew errors accumulate in the console.

### A5. Sign out, and confirm the session is dead

1. Sign out from the admin sidebar.

- [ ] The browser visits the Keycloak end-session endpoint (RP-initiated
      sign-out) and lands back on the site origin.
- [ ] Replay the token saved in A3 against an authenticated endpoint — it must
      be rejected. Tokens are revoked on sign-out (`revokeTokensOnSignout`):
      ```bash
      curl -si https://champagnefestival.tjor.im/api/me/registrations \
        -H "Authorization: Bearer <saved-token>" | head -1
      ```
      Expect `401`. A `200` here is a **failure** — file it.
- [ ] Navigate back to `/admin`. The app treats you as signed out.
- [ ] Click **Login** again: Keycloak prompts for credentials rather than
      silently re-authenticating from a surviving SSO cookie.

## B. Android

Requires a real device. An emulator does not validate the browser/app handoff.

### B1. Record the build and device

- [ ] App `versionName` (derived from root `VERSION`) and `versionCode`, from
      the app's settings/about screen or `adb shell dumpsys package …`.
- [ ] Device model, Android version, and the browser handling the Custom Tab
      (name + version).

### B2. Log in through the browser/app handoff

- [ ] Starting sign-in opens the system browser / Custom Tab — not an in-app
      WebView.
- [ ] The authorization request uses Authorization Code + PKCE and the
      **Android** client ID (distinct from the web client ID in A2).
- [ ] Completing the Keycloak prompt returns control to the app via the
      redirect URI, and the app shows a signed-in state.

### B3. Confirm authenticated app and API access

- [ ] An authenticated screen loads real data from the API (not cached or
      placeholder content — force-refresh it).
- [ ] Role-gated UI matches the test account's realm roles.

### B4. Sign out, and confirm a fresh login is required

Sign out from Settings.

- [ ] The Keycloak end-session endpoint is opened before local state is cleared.
- [ ] Encrypted local session state is cleared: relaunching the app (including
      after a force-stop) shows the signed-out state.
- [ ] Signing in again presents a real Keycloak credential prompt.

> **Watch for this specifically.** `AuthManager.logout()` clears local state even
> if the end-session leg fails — the failure is swallowed. So "the app asks me to
> log in again" alone does **not** prove the IdP session ended. If step B4's
> credential prompt is skipped and you are signed straight back in, the end-session
> call did not take effect; capture logs and open a follow-up issue.

## C. Pebble

Requires a real phone with the Pebble app **and** a real watch.

> **Precondition.** The Pebble companion app is unshipped and has not been run on
> physical hardware — it is emulator-verified only, and `fetch()` never completes
> under the emulator. If the hardware smoke test in
> [#757](https://github.com/tjorim/champagnefestival/issues/757) /
> [#778](https://github.com/tjorim/champagnefestival/issues/778) has not happened
> yet, do that first: a pairing failure here would otherwise be indistinguishable
> from a general "app doesn't work on hardware" failure.

### C1. Record the build

- [ ] Pebble app version from `pebble/package.json`, watch model, watch firmware
      version, and the phone's Pebble app version + phone OS version.

### C2. Complete the configuration webview login

1. In the phone's Pebble app, open **Settings** for the Champagnefestival app.

- [ ] `showConfiguration` fires and `Pebble.openURL()` opens the `/pebble-pair`
      page.
- [ ] The page completes sign-in through the site's real OIDC flow.
- [ ] Pairing calls `POST /api/me/pebble-token` and the webview closes itself via
      `pebblejs://close#…`.

### C3. Confirm the handoff reaches the watch

This is the acceptance criterion — the token must arrive *and be usable*.

- [ ] `webviewclosed` relays the credential to the watch
      (`Pebble.sendAppMessage`) and the watch persists it.
- [ ] The watchapp fetches `GET /api/pebble/registrations` and renders real
      registration data for the paired account — the correct event day and
      check-in status, not a cached/offline placeholder. Confirm the state label
      does not read as offline or stale.

### C4. Confirm the credential is scoped and revocable

- [ ] The `cfpat_` credential is rejected outside the Pebble endpoint. Against
      any Keycloak-only route it must fail:
      ```bash
      curl -si https://champagnefestival.tjor.im/api/me/registrations \
        -H "Authorization: Bearer cfpat_…" | head -1
      ```
      Expect `401`. A `200` is a **failure** — file it immediately, it is a
      privilege-scope defect.
- [ ] Re-pairing rotates the credential: pair a second time, then replay the
      *first* credential against `GET /api/pebble/registrations` — expect `401`.
- [ ] Revocation works: `DELETE /api/me/pebble-token` (as the signed-in user),
      then the watch's next refresh surfaces the sign-in-expired state rather
      than continuing to serve data.

## Results

Fill in one row per client, per run. Attach screenshots/logs to the issue.

| Client | App/build version | Client / device version | Date | Result | Notes / evidence |
|---|---|---|---|---|---|
| Web | | browser + OS | | pass / fail | |
| Android | | device model + Android version | | pass / fail | |
| Pebble | | watch model + FW, phone app version | | pass / fail | |

**Overall result:**

- [ ] Web complete
- [ ] Android complete
- [ ] Pebble complete
- [ ] Versions and device details recorded above
- [ ] Follow-up issues opened for every failure and inconsistency

## On failure

Do not fix defects inline in the validation run — the run's output is the
record. For each failure or inconsistent behavior, open a focused issue with:

- the section and step number from this document,
- app/build version and client/device version from the results table,
- observed vs. expected behavior,
- the relevant screenshot, HAR, `adb logcat` excerpt, or backend log lines.

Link each new issue back to the validation issue, and mark the corresponding row
above as failed rather than leaving it blank.
