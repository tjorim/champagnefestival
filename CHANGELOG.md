# Changelog

All notable changes to this project are documented in this file.

The release workflow requires entries in this format:

- `## [X.Y.Z] - YYYY-MM-DD`

Starting with the first `YYYY.MM.MICRO` release, `X.Y.Z` is CalVer rather than
SemVer — see "Versioning" in `AGENTS.md`. Existing SemVer entries below predate that switch.

## [Unreleased]

### Added

- Event titles and descriptions are translated into Dutch, French and English like organisation descriptions: `title_language`/`description_language` name the original, `title_nl/fr/en` and `description_nl/fr/en` hold the texts, and a missing translation falls back to the original. Public `GET /api/editions/active|upcoming` take `locale`, the server-rendered home page, its JSON-LD (new `subEvent` entries), the MCP `get_event_schedule` and registration confirmation emails use the visitor's language, and the admin event form edits every language with the same "suggest translation" drafts as organisations (`GET`/`POST /api/events/translation`). The single-language `title`/`description` input of `POST`/`PUT /api/events` and MCP `create_event`/`update_event` is replaced by the per-language fields (#1222)
- `GET /api/people` and `GET /api/volunteers` now take `sort` (people: `name`, `email`, `created`, `updated`; volunteers: `name`, `created`, `updated`) and `sort_dir`, with deterministic `id` tiebreaks and an index per sortable column. An unknown `sort` or `sort_dir` is a 422 (#1176)

- FAQ items, announcements, composed messages, policies, products (name and description) and poll option labels follow the same pattern as events: an original language that must have text, optional Dutch/French/English translations and a fallback to the original. Public reads (`/api/faq/active`, `/api/policies/{key}/current`, the edition endpoints, `/api/me/volunteer/poll-options`) take `locale`; order lines keep the product name in every language; the admin forms edit every language (#1222)
- Product categories are admin-managed data like event categories: a `product_categories` table with a label per language, public `GET /api/product-categories`, admin `POST`/`PUT`/`DELETE`, MCP tools and a "Product categories" admin screen. `Product.category` references the key (an unknown key is rejected) and `champagne`, which delivery tracking depends on, cannot be deleted. Migration `007` seeds `champagne`, `food` and `other` and moves the existing content above to Dutch (`nl`) as its original language (#1222)

### Changed

- **Breaking:** API and MCP clients that create translated content now fill the per-language fields (`title_*`, `name_*`, `label_*`, `question_*`/`answer_*`, `text_*`, ...) instead of one text; the original language defaults to `en` (admin forms preselect Dutch). Untranslated items are shown in their original language instead of being hidden, and policies no longer have `required_locales` — publishing needs only the original language (#1222)
- Event categories are admin-managed data instead of free text: an `event_categories` table with a stable key and a label per language (same original-language fallback as event titles), public `GET /api/event-categories`, admin `POST`/`PUT`/`DELETE`, MCP tools, and an "Event categories" screen in the admin. `Event.category` references the key; an unknown key is rejected and a category events still use cannot be deleted. Migration `006` seeds nine default categories (`tasting`, `vip`, `party`, `breakfast`, `exchange`, `general`, `ceremony`, `social`, `other`), keeps any other value events already use as a category of its own (logged for review), and moves existing event text to Dutch (`nl`) as its original language (#1222)
- Replaced the placeholder sharing image, favicons, home-screen/PWA icons, `logo.svg` fallback, Android launcher icon and Play Store graphics with the festival's brand: a real 1200×630 `og-image.jpg` (also the JSON-LD event image) and a "C" with a red script "f" mark. Sources and the generator live in `docs/brand/` (#1221)

### Removed

- **Breaking:** the legacy flat `required_role` key is gone from `GET /api/mcp/capabilities` and from `search_tools` results. Read `access.role` instead; `search_tools` entries now carry `access: {"role": ...}` like the manifest (tjorim/apps#229)

### Changed

- A Keycloak login with an explicitly verified email now joins the matching emailed-session account, so password and magic-link sign-in reach one account with the same bookings (#1209). Migration `005` relaxes `users` from exactly one to at least one identity; addresses linked to a Keycloak account get a "use your account sign-in" email instead of an app magic link; signing out of a Keycloak account also revokes its emailed session. Keycloak SMTP activation and production verification remain open. See `docs/decisions/1192-organization-manager-login.md#both-sign-in-methods-for-one-account--1209`.
- Consolidated completed UI migration notes into `docs/frontend-ui.md`; updated documentation links, clarified the warm-start implementation status and preserved product-audit history.

- **Breaking:** the exhibitor domain is renamed to organization throughout API/MCP routes, payload fields, database/storage names, configuration and code. Migration `004` renames existing records and creates descriptions/proposal history under the final organization names; deploy matching clients, application and infrastructure together. See `docs/organization-change-review.md#terminology-and-upgrade` (#1190).

- **Breaking for API clients that omit `limit`:** `GET /api/people` and `GET /api/volunteers` now default to 50 rows per page instead of 200, the same default as `GET /api/registrations`; an omitted `limit` is never unbounded and the maximum stays 1000. `page` without `limit` is now accepted instead of a 422. The volunteers list and the MCP `list_members` and `list_volunteers` tools now search with the same `q` semantics as the people list (also club, notes, phone and roles), and a volunteer search without `sort` is ordered by relevance (#1176)
- MCP tool failures are now actionable and traceable. Calling an unknown or role-hidden tool (directly or through `call_tool`) returns `Unknown tool 'x'. Use search_tools …` instead of an opaque `Error calling tool 'call_tool'`; invalid arguments name the failing fields without echoing the submitted values; and an unexpected error returns the exception type plus a request id that is also written, with the traceback, to the server log. Domain errors are unchanged. `get_active_edition` is now listed next to `whoami` without searching; `search_tools` results also carry `requires_confirmation` (always `false`), matching the capability manifest
- The frontend no longer ships Bootstrap, react-bootstrap or bootstrap-icons. Tailwind preflight replaces Bootstrap's reboot, utilities are unprefixed and no longer `!important`, and all owned, theme and vendor CSS now sits in cascade layers beneath the utilities (`docs/frontend-ui.md`). Runtime themes publish light/dark only through `data-theme-mode`; `data-bs-theme` is gone. Server-rendered `/` and `/privacy` fragments carry inline layout instead of Bootstrap's `container py-5` (#1111)
- MCP tool discovery is easier for agents: the server instructions now explain the `search_tools` → `call_tool` flow, and the `get_table_seating` and `update_table` descriptions include plain-language phrasing ("who is seated at table N", "move a table on the floor plan") so `search_tools` finds them
- The outbox worker no longer performs the daily cleanup sweep. Terminal outbox jobs, stale rate-limit buckets, expired visitor sessions and magic links, and stale push subscriptions are now removed by `python -m app.maintenance housekeeping`, which the VPS schedules daily (tjorim/apps). Retention settings are unchanged. Deployments that run the worker without that timer no longer clean these tables
- `GET /api/mcp/capabilities` now follows the shared MCP capability contract v1: a top-level `contract_version`, plus `requires_confirmation` and an `access` object (`{"role": ...}`) on every tool. `compare_layout_revisions` and `preview_layout_restore`, which only read data, are now reported as `read` instead of `write` (tjorim/apps#229)
- **Breaking for local development:** the backend now requires Python 3.14 (`requires-python >=3.14`), matching the production image; backend CI and the release workflow run on 3.14 too, and ruff targets `py314`. Upgraded SQLAlchemy to 2.1, which needs the `sqlalchemy[asyncio]` extra

## [2026.8.2] - 2026-08-01

### Fixed

- Android authentication now uses the dedicated native Keycloak client, restoring sign-in with the app's custom redirect scheme (#793)

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
