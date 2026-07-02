# Champagne Festival — Android

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

| Variant | API base URL | OIDC issuer |
|---------|-------------|-------------|
| `debug` | `http://10.0.2.2:8000/` (emulator → localhost) | `http://10.0.2.2:9000/…` |
| `staging` | `https://staging.champagnefestival.tjor.im/` (placeholder, configurable) | `https://staging-auth.tjor.im/…` (placeholder, configurable) |
| `release` | `https://api.champagnefestival.tjor.im/` | `https://auth.tjor.im/…` |

The API base URL can be overridden at runtime via **Settings → API base URL**.

### Staging variant

`staging` is a debug-signed, debuggable variant with its own application ID
(`be.champagnefestival.android.staging`), so it installs alongside the debug and
release apps. Its backend URLs resolve from a Gradle property or environment
variable of the same name, falling back to the placeholders above:

- `CHAMPAGNEFESTIVAL_ANDROID_STAGING_API_BASE_URL`
- `CHAMPAGNEFESTIVAL_ANDROID_STAGING_OIDC_ISSUER_URL`

```bash
./gradlew assembleStaging \
  -PCHAMPAGNEFESTIVAL_ANDROID_STAGING_API_BASE_URL=https://staging.example.com/
```

CI can build a distributable staging APK without production signing secrets via
the manual **Android Staging APK** workflow (`.github/workflows/android-staging.yml`),
which accepts both URLs as optional inputs.

### Release variant

The manual **Android Release APK** workflow (`.github/workflows/android-release.yml`)
builds a signed release APK and requires these repository secrets:

- `KEYSTORE_BASE64`, `KEY_ALIAS`, `KEY_PASSWORD`, `STORE_PASSWORD` — release signing
- `CHAMPAGNEFESTIVAL_ANDROID_RELEASE_API_BASE_URL` — e.g. `https://api.champagnefestival.tjor.im/`
- `CHAMPAGNEFESTIVAL_ANDROID_RELEASE_OIDC_ISSUER_URL` — e.g. `https://auth.tjor.im/realms/champagnefestival`

If the two URL secrets are unset, `assembleRelease` fails fast rather than
silently shipping an APK pointed at a placeholder host.

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

OIDC redirect URI: `be.champagnefestival.android://oauth2redirect`

Register this redirect URI with your OIDC provider.

## Backend API

The Android app consumes these backend endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/editions/active` | public | Active edition context |
| `GET`  | `/api/events` | volunteer+ Bearer | Event list |
| `POST` | `/api/check-in/{id}/lookup` | token-gated | Look up registration by QR token |
| `POST` | `/api/check-in/{id}` | token-gated | Mark guest checked in |
| `GET`  | `/api/volunteer/registrations?q=` | volunteer+ Bearer | Guest/table lookup with order + delivery state |

## Screens

- **Login** — OIDC sign-in flow
- **Active Edition** — current/upcoming edition overview with event list
- **QR Scan** — CameraX live scanner, parses `{registrationId}:{token}` QR payloads
- **Guest Lookup** — debounced guest/table search with check-in + delivery summary
- **Registration Detail** — guest info, table, pre-orders, delivery state, check-in action
- **Check-in Confirmation** — success / already-checked-in result with guest name
- **Settings** — API URL override, OIDC info, app version, logout
