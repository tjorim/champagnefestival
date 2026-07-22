# Changelog

All notable changes to this project are documented in this file.

The release workflow requires entries in this format:

- `## [X.Y.Z] - YYYY-MM-DD`

Starting with the first `YYYY.MM.MICRO` release, `X.Y.Z` is CalVer rather than
SemVer — see "Versioning" in `AGENTS.md`. Existing SemVer entries below predate that switch.

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
