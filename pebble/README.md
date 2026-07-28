# Pebble companion app

Status: **builds and runs in the Pebble `emery` emulator; not yet run on real
hardware.** The emulator proves the package builds, the watchapp launches and
stays running, and Piu/`localStorage`/config-message plumbing work — it
cannot prove anything that needs a live HTTP round-trip (loading
registrations, or the sign-in-expired/retryable/network-error states), so
that and the physical-watch smoke test are still open. See
[`EMULATOR.md`](EMULATOR.md) for the runbook and its one hard limitation.
Tracks [issue #757](https://github.com/tjorim/champagnefestival/issues/757)
and validation issue [#778](https://github.com/tjorim/champagnefestival/issues/778).

A glanceable watch app for Pebble Time 2 / Pebble Round 2, built with
[Alloy](https://developer.repebble.com/guides/alloy/), Pebble's JS/TS SDK.
Shows the visitor's check-in status and next event day through the
Pebble-scoped `GET /api/pebble/registrations` view of the same registration
data used by the web frontend (`backend/app/routers/me.py`).

## Layout

```text
pebble/
  package.json            # app manifest
  wscript                 # Pebble SDK build rules
  src/
    c/mdbl.c               # native bootstrap for the Alloy runtime
    embeddedjs/manifest.json
    embeddedjs/main.js     # watch-side: Piu UI, fetch(), pairing token storage
    pkjs/index.js          # phone-side: network proxy + pairing handoff
  scripts/
    validate.mjs            # package-contract check, run in CI
    mock-server.py           # stand-in backend for emulator testing
  resources/               # icons/fonts (empty for now)
```

Every API used in `src/` (Piu widgets, `pebble/message`, `fetch()`,
`localStorage`, `watch.connected`, the classic PebbleKit JS
`showConfiguration`/`Pebble.openURL`/`webviewclosed` flow, and the
`package.json` manifest shape) was cross-checked against
[developer.repebble.com/guides/alloy](https://developer.repebble.com/guides/alloy/)
and the [Moddable Pebble Examples](https://github.com/Moddable-OpenSource/pebble-examples)
(`hellofetch`, `hellomessage`). The build, launch, and UI/config paths are now
verified against the `emery` emulator (see `EMULATOR.md`); the `fetch()` call
in `main.js` and the resulting registration rendering are still unverified —
Alloy's `fetch()` never completes under the emulator, so that path needs a
real device.

## How it fits together

1. **Watch → phone → internet.** Per Alloy's networking model, `fetch()`
   calls in `src/embeddedjs/main.js` run on the watch but are transparently
   proxied through the phone by the `@moddable/pebbleproxy` package wired up
   in `src/pkjs/index.js` — the phone-side file doesn't need custom fetch
   logic of its own.
2. **Data.** The watch calls `GET /api/pebble/registrations` with its scoped token,
   picks today's event (or the next upcoming one), and shows the title, date,
   and check-in status via a small Piu UI.
3. **Pairing (getting a scoped token onto the watch).** This reuses the
   classic Pebble app-configuration flow:
   - The user taps "Settings" for the app in the phone's Pebble app, firing
     `showConfiguration` in `src/pkjs/index.js`, which calls
     `Pebble.openURL()` to open `frontend/src/components/PebblePairPage.tsx`
     (route: `/pebble-pair`).
   - That page signs the user in via the site's existing OIDC flow, rotates a
     long-lived `cfpat_...` credential through `POST /api/me/pebble-token`,
     then closes the webview with `pebblejs://close#<json>` carrying that
     credential. It is scoped to `GET /api/pebble/registrations` and cannot
     call the general visitor, volunteer, or admin APIs.
   - `webviewclosed` in `src/pkjs/index.js` relays the token to the watch via
     `Pebble.sendAppMessage`; the watch stores it in `localStorage` and uses
     it for subsequent `fetch()` calls.

## Offline behavior

The last successful registration is cached for up to 12 hours. Future-stamped
snapshots are also discarded after a watch-clock rollback. While the phone is
disconnected or a request fails, the watch keeps that useful glance on screen
and labels it with the reason and read time, for example
`Phone offline · 08:12`.

A changed pairing token or server URL clears the snapshot. Any response still
in flight for the previous identity is discarded, and the new refresh is
serviced after the active request, so one account or deployment can never see
another's data.

The watch is read-only, so there is no offline action queue or mutation-replay
risk.

## What's needed before this can actually run

- **Database migration.** Deploy Alembic revision `002` before pairing. A new
  pairing rotates the previous watch credential; deleting the portal account
  also deletes it.
- **Physical-device verification.** `pebble build` / `pebble install
  --emulator emery` have been run (see `EMULATOR.md`), but that only proves
  the app builds and launches — the `fetch()`-dependent registration loading
  and error states are unverified until this runs on a real Pebble Time 2,
  since Alloy's `fetch()` never completes under the emulator.
- Pebble CI validates the package and offline behavior, builds a `.pbw`, boots
  it on Emery, and checks a screenshot for the rendered app. It is not wired
  into `VERSION` sync or the release process.

## Building it

```sh
pebble build
pebble install --emulator emery   # or: pebble install --phone <phone-ip>
```

See [`EMULATOR.md`](EMULATOR.md) for the full emulator setup, a mock backend
for exercising the watch's error states, and known gotchas (an IPv6-only
pypkjs startup failure, a blank-screen font defect and how to debug it, and
why `fetch()` doesn't work under the emulator at all).
