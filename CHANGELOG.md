# Changelog

All notable changes to this project are documented in this file.

The release workflow requires entries in this format:

- `## [X.Y.Z] - YYYY-MM-DD`

Starting with the first `YYYY.MM.MICRO` release, `X.Y.Z` is CalVer rather than
SemVer — see "Versioning" in `AGENTS.md`. Existing SemVer entries below predate that switch.

## [2026.8.1] - 2026-08-01

### Changed

- Admin loading uses stable skeleton layouts, and the sidebar identifies the signed-in account and role more clearly (#781)

### Fixed

- Web sign-in and sign-out now show pending states; expired access tokens attempt one silent renewal before signing out, and the reason survives the identity-provider round trip (#781)
- Pebble pairing surfaces authentication failures and offers a working sign-in retry inside the configuration webview (#781)
- Android Settings retry now reloads preferences, and interactive logout waits for the Keycloak end-session flow before clearing local state while preventing duplicate launches (#781)
- PyJWT was updated to 2.13.0 to include the current upstream security fixes and restore resolvable dependency updates

## [2026.7.2] - 2026-07-28

### Added

- A Pebble Time 2 companion app with an authenticated web pairing flow, revocable narrowly scoped credentials, offline display cache, event-day registration glance, and emulator/live HTTP validation coverage (#759, #779)
- Google Play Store listing assets for the Android app

### Changed

- App versioning now uses CalVer (`YYYY.MM.MICRO`) from the repo-root `VERSION` file across the backend, frontend, and Android app (#756)
- The initial Alembic migration history was consolidated for a clean deployment baseline (#758)

### Fixed

- Authenticated MCP requests now accept dedicated Keycloak service-account tokens as well as interactive user tokens
- Pebble pairing and watch refresh handling now recover safely from transient failures, token rotation races, offline periods, and stale cached state (#779)

### Security

- Web, Android, Pebble, and MCP authorization now use distinct Keycloak clients or purpose-specific credentials, with RP-initiated logout and no compatibility fallback (#759)
- Backend host validation, secret handling, Sentry sampling, and rate limiting were hardened (#755)

## [0.1.1] - 2026-07-22

### Added

- Visual refresh: light/dark theme support, mobile navigation, and refreshed layout across the site (#663)

### Changed

- Active edition selection (web, Android, and MCP) is now scoped to festival editions by default instead of picking up the nearest Bourse or capsule-exchange edition (#739, #746)
- Community edition contact email validation aligned between backend and frontend (#745)

### Fixed

- Every active event for a community edition is now rendered, not just the first (#743)
- Inactive (draft/cancelled) events no longer leak into public edition projections (#744)
- Converting a festival edition to a community edition now correctly clears its exhibitors (#747)
- A malformed contact email on one edition no longer hides the entire community events list (#745)
- Raised Android minSdk to 30 and added a real keystore-cipher check to biometric unlock verification (#749)

### Security

- Check-in/registration rate limiter no longer trusts a client-supplied X-Real-IP/X-Forwarded-For header unless the request actually came through the reverse proxy, closing a rate-limit bypass (#752)
- Addressed a CodeQL-flagged risky cryptographic algorithm usage (#751)

## [0.1.0] - 2026-05-27

### Added

- Initial tracked release baseline.
