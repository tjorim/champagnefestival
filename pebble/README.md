# Pebble companion app

Status: **not yet built or run against real hardware or the `pebble`
emulator.** Tracks [issue #757](https://github.com/tjorim/champagnefestival/issues/757).

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
  resources/               # icons/fonts (empty for now)
```

Every API used in `src/` (Piu widgets, `pebble/message`, `fetch()`,
`localStorage`, `watch.connected`, the classic PebbleKit JS
`showConfiguration`/`Pebble.openURL`/`webviewclosed` flow, and the
`package.json` manifest shape) was cross-checked against
[developer.repebble.com/guides/alloy](https://developer.repebble.com/guides/alloy/)
and the [Moddable Pebble Examples](https://github.com/Moddable-OpenSource/pebble-examples)
(`hellofetch`, `hellomessage`). None of it has been run on a device or the
emulator, so treat it as "should work per the docs," not "verified working."

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

## What's needed before this can actually run

- **Database migration.** Deploy Alembic revision `002` before pairing. A new
  pairing rotates the previous watch credential; deleting the portal account
  also deletes it.
- **Device verification.** None of `src/embeddedjs/main.js` or
  `src/pkjs/index.js` has been run through `pebble build` /
  `pebble install --emulator emery` yet — do that before relying on it, in
  case the docs missed something (Alloy is very new).
- Not wired into `VERSION` sync, CI, or the release process — that happens
  once/if the app graduates past this stage.

## Building it (untested — see above)

```sh
pebble build
pebble install --emulator emery   # or: pebble install --phone <phone-ip>
```
