# Pebble companion app

Status: **not yet built or run against real hardware or the `pebble`
emulator.** Tracks [issue #757](https://github.com/tjorim/champagnefestival/issues/757).

A glanceable watch app for Pebble Time 2 / Pebble Round 2, built with
[Alloy](https://developer.repebble.com/guides/alloy/), Pebble's JS/TS SDK.
Shows the visitor's check-in status and next event day, sourced from the same
`GET /api/me/registrations` endpoint the web frontend and Android app already
use (`backend/app/routers/me.py`) — no backend changes were needed for that
part.

## Layout

```
pebble/
  package.json            # app manifest
  src/
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
2. **Data.** The watch calls `GET /api/me/registrations` with a Bearer token,
   picks today's event (or the next upcoming one), and shows the title, date,
   and check-in status via a small Piu UI.
3. **Pairing (getting an OIDC token onto the watch).** This reuses the
   classic Pebble app-configuration flow:
   - The user taps "Settings" for the app in the phone's Pebble app, firing
     `showConfiguration` in `src/pkjs/index.js`, which calls
     `Pebble.openURL()` to open `frontend/src/components/PebblePairPage.tsx`
     (route: `/pebble-pair`).
   - That page signs the user in via the site's existing OIDC flow
     (`AuthContext`/`react-oidc-context`), then closes the webview with
     `pebblejs://close#<json>` carrying the access token.
   - `webviewclosed` in `src/pkjs/index.js` relays the token to the watch via
     `Pebble.sendAppMessage`; the watch stores it in `localStorage` and uses
     it for subsequent `fetch()` calls.

## What's needed before this can actually run

- **OIDC redirect URI.** The `champagnefestival` OIDC client's allowed
  redirect URIs need `https://champagnefestival.tjor.im/pebble-pair` added.
  That client is provisioned in the separate infra stack
  (`/opt/apps/infra`), not this repo — an admin needs to add it there.
- **Token refresh.** The watch only stores the access token it's handed at
  pairing time; there's no refresh-token flow yet, so once the access token
  expires the watch falls back to "Sign-in expired" and the user has to
  re-open Settings to re-pair. Fine for a first cut, but a real refresh flow
  would be needed for daily use.
- **Device verification.** None of `src/embeddedjs/main.js` or
  `src/pkjs/index.js` has been run through `pebble build` /
  `pebble install --emulator emery` yet — do that before relying on it, in
  case the docs missed something (Alloy is very new).
- Not wired into `VERSION` sync, CI, or the release process — that happens
  once/if the app graduates past this stage.

## Building it (untested — see above)

```
pebble build
pebble install --emulator emery   # or: pebble install --phone <phone-ip>
```
