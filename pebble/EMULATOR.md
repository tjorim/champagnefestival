# Testing the Pebble app without a watch

A runbook for the Emery QEMU emulator, written up after using it to find and
fix the build and startup defects described in [`README.md`](README.md). It
exists because the emulator is far more useful here than it first looks — but
also has one hard limit that decides what still needs hardware.

## What the emulator can and cannot prove

It can prove: the package builds; the watchapp launches and stays running; Piu
renders what you expect at the real screen size; fonts and glyphs resolve;
`localStorage` works; and configuration sent from the phone side arrives and
is read back correctly.

It cannot prove anything requiring a live HTTP round-trip — loading
`GET /api/pebble/registrations`, or the sign-in-expired / retryable-error /
network-error states that depend on a real response reaching the watch.
Watch-side `fetch()` never completes under QEMU. See [The `fetch()` dead
end](#the-fetch-dead-end) for why, and don't spend a day rediscovering it.

Champagnefestival's watch app is read-only (it only ever displays
registrations; there's no complete/skip-style mutation to replay), so there
is no button-press/mutation-replay check to run here at all — that concern is
specific to other Pebble companions in this account and doesn't apply to this
package.

## One-time setup

```sh
sudo apt install nodejs npm libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g
uv tool install pebble-tool     # Python 3.10+; https://docs.astral.sh/uv/
pebble sdk install latest       # SDK 4.17 + ARM and Moddable toolchains
```

Two environment notes that cost time:

- `qemu-pebble` is not on `PATH`. It lives in the SDK toolchain, at
  `~/.local/share/pebble-sdk/SDKs/4.17/toolchain/bin/qemu-pebble`. You only
  need it directly if you are booting the emulator by hand.
- **If the host has no IPv6**, pypkjs cannot start. It binds its websocket with
  `pywsgi.WSGIServer(("", port), ...)`, which resolves to `AF_INET6` and fails
  with `OSError: [Errno 97] Address family not supported by protocol`; the
  `pebble` CLI reports this only as a bare `[Errno 111] Connection refused]`.
  Patch the installed copy to bind IPv4:

  ```sh
  # ~/.local/share/uv/tools/pebble-tool/lib/python3.11/site-packages/pypkjs/runner/websocket.py
  -  self.server = pywsgi.WSGIServer(("", self.port), ...)
  +  self.server = pywsgi.WSGIServer(("127.0.0.1", self.port), ...)
  ```

## Running the app

```sh
cd pebble
export SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy   # headless hosts only
pebble build
pebble install --emulator emery                      # boots the emulator if needed
pebble logs --emulator emery
pebble screenshot --emulator emery --no-open shot.png
```

`pebble install` launches the app as a side effect, so reinstalling is the
normal way to restart it.

## Debugging when there is nothing in the logs

**Watch-side `console.log` does not reach `pebble logs` in a release build.**
Only PKJS output does. A watchapp that throws during startup therefore shows a
blank screen and produces no diagnostic whatsoever — which is exactly how the
font defect presented.

The technique that worked is to treat the screen as the console: render
diagnostics into a Piu `Label` and take a screenshot. `src/embeddedjs/main.js`
already has `titleLabel`/`statusLabel` wired up for this — temporarily set
`titleLabel.string` to whatever you want to inspect instead of adding a new
element.

From there, bisect. A minimal Piu app with a black fill renders, so Piu works;
add a `Style` with the app's font and it dies, so the font is the problem. It is
also worth swapping in the stock `pebble new-project --alloy` watchface as a
control — if that renders inside your package, the toolchain and your
`package.json` are fine and the fault is in your own `main.js`.

The alternative is `pebble build --debug` plus an xsbug session, which gives
real exceptions but needs a debugger attached.

## Driving the app

**Configuration.** You do not need the `/pebble-pair` webview to exercise the
watch side. Message keys are assigned numerically by the build — read them
from `build/*.pbw`'s `appinfo.json` rather than trusting this doc, but given
`package.json`'s `pebble.messageKeys` here is `["API_BASE_URL", "AUTH_TOKEN"]`
in that order, expect `API_BASE_URL` at 10000 and `AUTH_TOKEN` at 10001,
clear of the proxy's 15000+ range — confirm against your own build output
before relying on it. Push them directly:

```sh
pebble send-app-message --emulator emery \
  --string 10000=http://127.0.0.1:8899 10001=cfpat_test000000000000000000000000
```

`--string KEY=VALUE` requires the numeric key; passing the symbolic name is
rejected. This exercises the real path in `src/embeddedjs/main.js` — the
`Message`'s `onReadable`, the `msg.get("AUTH_TOKEN")` lookup, and the
`localStorage.setItem("authToken", …)` write — then triggers `maybeRefresh()`.

**Other state.** `pebble emu-bt-connection --connected no|yes` toggles the
Bluetooth connection (the app calls `refreshGlance` from the `connected` event
and gates on `watch.connected.pebblekit`), and `pebble emu-set-time` moves the
clock — useful for confirming `pickRelevantRegistration()` picks today's event
over an upcoming one as the emulator's date changes.

There are no buttons to drive: the watch app has no button handlers, since it
only ever renders whatever the last successful `refreshGlance()` fetched.

## The mock backend

[`scripts/mock-server.py`](scripts/mock-server.py) implements
`GET /api/pebble/registrations` from `backend/app/routers/me.py`'s
`pebble_router`, with the same `Authorization: Bearer cfpat_...` check as
`authenticate_pebble_token` in `backend/app/services/pebble_access.py`. It
logs every request to `requests.log`, which is the point: this is a stand-in
for a real backend when validating the watch's rendering, retry, and
error-state behavior without needing a live server and a real Keycloak login
on hand.

```sh
python3 pebble/scripts/mock-server.py 8899
```

Change the `--status` flag to make it return `401`, `429`, or `500` instead
of `200`, to check the watch renders the matching "Sign-in expired" /
"Try again later" / "Request failed" state from `refreshGlance()` in
`src/embeddedjs/main.js`.

It is equally useful for the hardware run — point `API_BASE_URL` at a laptop
on the same network instead of at the real production API, and you get an
exact record of what the watch actually requested and with which token.

## The `fetch()` dead end

Watch-side `fetch()` never completes under QEMU + pypkjs. The promise never
settles, and no request reaches the server — `refreshGlance()` in
`src/embeddedjs/main.js` hangs indefinitely instead of resolving into either
branch.

What happens: `httpclient-pebble.js` opens its own AppMessage channel and only
writes a queued request when that channel reports writable. In
`pebble-appmessage.c`, writability is granted by `updateActive()`, which is
driven by a PebbleOS comm-session event gated on
`sys_app_pp_get_comm_session()` — a *system* session that pypkjs never
establishes. So the request sits in the queue forever.

Things that look like the cause but are not: `watch.connected.pebblekit` is
`true` throughout, and the proxy handshake completes (enable
`moddableProxy.log = true` in `src/pkjs/index.js` and you will see
`readyReceived` and the watch's `15025` probe). Toggling
`emu-bt-connection` to force a session event does not help either.

A fetch-only app containing no Champagnefestival-specific code stalls
identically, so this is an emulator limitation, not an app bug. Confirm that
first if you ever suspect otherwise.

One consequence worth recognising: each stalled fetch is retained, so a
watchapp that keeps re-triggering `refreshGlance()` (for example by repeatedly
toggling `emu-bt-connection`) eventually aborts with `fxAbort memory full` in
the log. That is a symptom of the stall, not an independent memory bug.

## Gotchas

- **`pkill -f qemu-pebble` can kill the shell running it.** If the pattern
  appears in the enclosing `bash -c` command line, `pkill -f` matches that
  process too and the script dies silently with a nonzero exit and no output.
  Use `pkill -x qemu-pebble`, or put the commands in a script file.
- **A wedged emulator reports `libpebble2.exceptions.TimeoutError` or
  `Connection refused`**, and `pebble install` may log `QEMU is already
  running` while nothing responds. `pebble kill` and start again; this happens
  after an `fxAbort` or a Bluetooth toggle.
- **The emulator persists app storage across installs**, under
  `~/.local/share/pebble-sdk/4.17/emery`. `localStorage` survives a reinstall,
  so an `authToken`/`apiBaseUrl` from an earlier run will make the app skip
  straight to a refresh instead of showing "Not paired". Use `pebble wipe`
  for a genuinely clean device.
- **Screenshots need `SDL_VIDEODRIVER=dummy`** on a headless host, or QEMU fails
  to start with an SDL error.
