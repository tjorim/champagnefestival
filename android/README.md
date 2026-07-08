# Champagnefestival — Android

Native Android companion app for on-site volunteer check-in and event-day guest lookup.

## Architecture

Single-module Gradle project with packages organized by layer:

```
be.champagnefestival.android/
├── app/        — Application class, MainActivity, NavGraph
├── core/       — Auth (OIDC/AppAuth), networking, DataStore
├── data/       — Retrofit API service, DTOs, repositories
├── feature/    — Login, Active Edition, QR Scan, Guest Lookup, Registration, Settings
└── ui/         — Material 3 theme, shared composables
```

## Tech Stack

- **Kotlin + Jetpack Compose** — native UI
- **Navigation Compose** — single-activity navigation
- **Retrofit + OkHttp** — API calls
- **Kotlinx Serialization** — JSON
- **DataStore Preferences** — token and settings storage
- **AppAuth** — OIDC / Keycloak authentication
- **CameraX + ML Kit Barcode** — QR code scanning
- **Coroutines + StateFlow** — async / reactive state

## Build Variants

| Variant | API base URL | OIDC config |
|---------|-------------|-------------|
| `debug` | `http://10.0.2.2:8000/` (emulator → localhost) by default, or `ANDROID_DEBUG_API_BASE_URL` if set | `/api/auth/oidc-config` from the API |
| `release` | `https://champagnefestival.tjor.im/` | `/api/auth/oidc-config` from the API |

The API base URL can also be overridden at runtime via **Settings → API base URL**, without rebuilding.

### Release variant

The manual **Android Release APK** workflow (`.github/workflows/android-release.yml`)
builds a signed release APK and requires these repository secrets:

- `KEYSTORE_BASE64`, `KEY_ALIAS`, `KEY_PASSWORD`, `STORE_PASSWORD` — release signing
- `ANDROID_API_BASE_URL` — e.g. `https://champagnefestival.tjor.im/`
  (the backend is routed by path under the main host — `/api*`, not a separate `api.` subdomain —
  see `DEPLOYMENT.md`; `ChampagneApiService` endpoints already include the `api/` prefix)
- `ANDROID_CERTIFICATE_PIN_HOST` — e.g. `champagnefestival.tjor.im`
- `ANDROID_CERTIFICATE_PINS` — comma-separated `sha256/<base64 SPKI hash>` pins,
  used for certificate pinning in release builds (see "Choosing what to pin" below)

If any of these secrets are unset, `assembleRelease` fails fast rather than
silently shipping an APK pointed at a placeholder host or stale certificate pins.
OIDC authorization and token endpoints are discovered from
`${ANDROID_API_BASE_URL}/api/auth/oidc-config`, so the Android workflow does not
need an OIDC issuer secret.

#### Choosing what to pin

`OkHttp`'s `CertificatePinner` matches a pin against **any** certificate in the chain, not just
the leaf, so which certificate(s) you pin determines how often the pins need to be rotated:

- **Leaf certificate** — changes on every renewal. Note that the certificate a client actually
  sees is whatever terminates client-facing TLS — for this project that's Cloudflare's edge
  certificate (see `DEPLOYMENT.md`), not necessarily Caddy's origin certificate. Most ACME/edge
  TLS providers generate a new key pair per certificate by default, so pinning the leaf means the
  pins go stale roughly every 60–90 days, requiring a new app release each time or every release
  build will start rejecting valid connections.
- **Issuing intermediate CA** (recommended) — rotates on the order of years, not months, so this
  survives routine certificate renewals. This is what most production pinning setups pin against.
- **Root CA** — most stable, but pins the broadest trust scope (any cert from that root would be
  accepted for the pinned host).

Pin **both** the current issuing intermediate and a backup (either the root, or a second
intermediate the CA publishes as a cross-sign/rollover target) so a routine CA-side rollover
doesn't lock out installed apps before the next release.

Regenerate pins with (index `0` is the leaf, `1` is the first intermediate, `2` the next, etc. —
inspect the `subject=`/`issuer=` lines from the second command to identify which index is which):

```bash
# Show the chain so you can identify the intermediate/root you want to pin
openssl s_client -connect champagnefestival.tjor.im:443 -servername champagnefestival.tjor.im \
  -showcerts </dev/null 2>/dev/null | grep -E "^(subject|issuer)="

# Compute the SPKI pin for chain certificate at index N (0=leaf, 1=intermediate, ...)
N=1
openssl s_client -connect champagnefestival.tjor.im:443 -servername champagnefestival.tjor.im \
  -showcerts </dev/null 2>/dev/null \
  | awk -v n="$N" '/BEGIN CERTIFICATE/{c++} c==n+1{print} /END CERTIFICATE/&&c==n+1{exit}' \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
```

Certificate pins must still be rotated whenever the **issuing CA itself changes** (e.g. migrating
hosting/CDN providers, or Caddy switching ACME CAs) — pinning the intermediate only protects
against routine leaf renewal, not a CA migration.

## Getting Started

### Prerequisites

- Android Studio Hedgehog or newer
- JDK 17+
- Android SDK 26+

### Running locally

1. Start the backend: `docker compose up db -d && cd backend && uv run uvicorn app.main:app --reload`
2. Open `android/` in Android Studio
3. Run on an emulator or USB-connected device

### Command line

```bash
cd android
./gradlew assembleDebug          # build debug APK
./gradlew testDebugUnitTest      # run unit tests
./gradlew installDebug           # install on connected device/emulator
```

## Authentication

The app uses OpenID Connect (Keycloak / authentik) via [AppAuth for Android](https://github.com/openid/AppAuth-Android).

OIDC redirect URI: `im.tjor.champagnefestival://oauth2redirect`
(debug builds use `im.tjor.champagnefestival.debug://oauth2redirect`, from the `applicationIdSuffix`)

Register this redirect URI with your OIDC provider.

## Backend API

The Android app consumes these backend endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/editions/active` | public | Active edition context |
| `GET`  | `/api/events` | volunteer+ Bearer | Event list |
| `GET`  | `/api/events/checkin-stats` | volunteer+ Bearer | Per-event registration/check-in counts |
| `POST` | `/api/check-in/{id}/lookup` | token-gated | Look up registration by QR token |
| `POST` | `/api/check-in/{id}` | token-gated | Mark guest checked in |
| `GET`  | `/api/volunteer/registrations?q=` | volunteer+ Bearer | Guest/table lookup with order + delivery state |

## Screens

- **Login** — OIDC sign-in flow
- **Active Edition** — current/upcoming edition overview with event list and live check-in progress
- **QR Scan** — CameraX live scanner (torch toggle, tap-to-focus), parses `{registrationId}:{token}` QR payloads, manual entry fallback
- **Guest Lookup** — debounced guest/table search with check-in + delivery summary
- **Registration Detail** — guest info, table, pre-orders, delivery state, check-in action
- **Check-in Confirmation** — success / already-checked-in / queued-for-sync result, auto-returns to the scanner
- **Settings** — API URL override, OIDC info, app version, logout

### Offline check-in queue

Scanning a wristband while offline saves the check-in locally (`PendingCheckInStore`, DataStore-backed)
instead of failing outright. `CheckInSyncManager` submits queued check-ins automatically once
connectivity returns, relying on the backend's idempotent check-in endpoint (a repeat submission
just returns `already_checked_in: true`, it never errors). A banner shows the pending count until
everything has synced.
