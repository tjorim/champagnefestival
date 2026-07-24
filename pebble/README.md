# Pebble companion app (experimental scaffold)

Status: **exploratory scaffold, not shipped, not built by CI.** Tracks
[issue #757](https://github.com/tjorim/champagnefestival/issues/757).

This directory is an early skeleton for a Pebble Time 2 / Pebble Round 2
companion app built with [Alloy](https://developer.repebble.com/guides/alloy/),
Pebble's JS/TS SDK (announced Feb 2026, out of developer preview as of this
writing). The idea: a glanceable watch view showing a visitor's check-in
status and upcoming event day, sourced from the same `/api/me/registrations`
endpoint the web frontend and Android app already use
(`backend/app/routers/me.py`).

## Why this exists as a scaffold rather than a finished app

Alloy is a very new SDK. The public docs
(https://developer.repebble.com/guides/alloy/,
https://developer.repebble.com/docs/) confirm the project layout below and
that TypeScript and `fetch()` are supported, but do **not** publish a
canonical `package.json` manifest or concrete widget-rendering API in a form
that could be copied verbatim. Rather than invent plausible-looking API calls
that might be wrong, the watch-side code here is intentionally left as
commented pseudocode with explicit `TODO(verify)` markers. Anyone picking this
up should cross-check against the
[Moddable Pebble Examples](https://github.com/Moddable-OpenSource) (e.g.
`hellofetch`, `hellotypescript`, `hellopiu-text`) and/or
`pebble new-project --alloy` output before relying on it.

## Layout

```
pebble/
  package.json            # app manifest (fields marked TODO need verification)
  src/
    embeddedjs/main.js     # watch-side code (pseudocode, unverified widget API)
    pkjs/index.js          # phone-side code: fetches /api/me/registrations
  resources/               # icons/fonts (empty for now)
```

Per Alloy's split model, `pkjs` runs on the phone and is the only side with
network access; it proxies data to the watch. `embeddedjs` runs natively on
the watch via Moddable's XS engine.

## Data source (already exists, no backend changes needed)

`GET /api/me/registrations` (see `backend/app/routers/me.py`) already returns
everything a glance view needs per registration: `event_title`, `event_date`,
`checked_in`, `checked_in_at`, `status`. The phone-side script in
`src/pkjs/index.js` calls this endpoint directly and picks the most relevant
registration (today's event, else the next upcoming one).

## Open design question: authentication

This is the biggest unresolved question and the main reason this stays a
scaffold. `/api/me/*` requires an OIDC Bearer JWT (see `backend/app/auth.py`,
`get_current_claims`). The Android app obtains this via a full Authorization
Code + PKCE browser flow (`android/app/src/main/kotlin/.../core/auth/`). It's
not yet clear whether Alloy's `pkjs` environment can drive a system-browser
OAuth redirect the same way, or whether pairing needs a different mechanism
(e.g. a short-lived pairing code displayed on the web portal and typed/scanned
once). This needs to be resolved with real device testing before any of the
auth code in `src/pkjs/index.js` can be written for real — it's currently a
`TODO` stub.

## Not done yet

- No real widget/rendering code (unverified Alloy API surface).
- No auth/token flow (open design question above).
- Not wired into `VERSION` sync, CI, or the release process — this only
  happens once/if the app graduates past scaffold status.
- No Pebble hardware or `pebble` CLI available in this environment, so none
  of this has been built or run.
