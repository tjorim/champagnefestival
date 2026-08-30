# Champagnefestival — Frontend

React + Vite SPA for the Champagnefestival website, with TypeScript, Bootstrap, and Paraglide i18n.

## Quick start

```bash
cd frontend
pnpm install        # install dependencies
pnpm dev            # dev server → http://localhost:5173
```

The dev server proxies `/api/*` to `http://localhost:8000` (backend).
To develop without a running backend, see [Mock API (MSW)](#mock-api-msw) below.

## Available scripts

| Command                  | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `pnpm dev`               | Start Vite dev server                              |
| `pnpm build`             | Production build → `dist/`                         |
| `pnpm preview`           | Preview the production build locally               |
| `pnpm lint`              | Run oxlint                                         |
| `pnpm format`            | Format with Prettier                               |
| `pnpm typecheck`         | TypeScript check (no emit)                         |
| `pnpm test`              | Run tests with Vitest                              |
| `pnpm test:ui`           | Vitest with browser UI                             |
| `pnpm paraglide:compile` | Regenerate i18n message functions from `messages/` |

## Project structure

```text
frontend/
├── messages/          # i18n translation files (nl.json, en.json, fr.json)
├── public/            # static assets (images, fonts, …)
└── src/
    ├── components/    # React components (feature sub-directories)
    ├── config/        # site configuration (schedule, navigation, …)
    ├── hooks/         # custom React hooks
    ├── mocks/         # MSW mock handlers and seed data (dev-only)
    ├── paraglide/     # generated i18n message functions (do not edit)
    ├── router.tsx     # TanStack Router setup + shared route search validators
    ├── types/         # TypeScript type definitions
    └── utils/         # shared utilities (date helpers, …)
```

## Internationalization

Translations live in `messages/{locale}.json` (`nl`, `en`, `fr`). After editing, regenerate:

```bash
pnpm paraglide:compile
```

Use generated message functions in components:

```tsx
import * as m from "../paraglide/messages.js";
<h1>{m.welcome_title()}</h1>;
```

## Mock API (MSW)

The frontend ships an optional [MSW v2](https://mswjs.io) mock layer that intercepts all `/api/*`
requests at the Service Worker level, so you can do full UI development and demos without a running
backend.

### Enable

Create `frontend/.env.development.local` (already listed in `.gitignore`):

```env
VITE_MSW=true
```

Then start the dev server as usual:

```bash
pnpm dev
```

A `[MSW] Mock Service Worker active` notice appears in the browser console when the worker is
running. Log in to the Admin Dashboard with token **`dev-token`**.

> [!NOTE]
> In-memory state resets on every page reload — this is intentional. Use the real backend for
> persistence.

Vitest also uses the same handlers and fixtures through `src/mocks/server.ts`, and each test resets
mutable mock state with `resetAdminStore()` in `tests/setup.ts`.

### Auth fixture contract

Protected admin endpoints in mock mode support deterministic auth states:

- token `dev-token` → success
- token `mock-access-token` → success
- missing token → `401 Not authenticated`
- token `forbidden-token` → `403 Forbidden`
- token `expired-token` → `401 Token expired`
- token `invalid-token` (or any unknown token) → `401 Invalid token`

### Seed data

The mock layer ships with a March 2026 festival edition and realistic seed data across all
resources:

| Resource        | Count                 | Notes                                                  |
| --------------- | --------------------- | ------------------------------------------------------ |
| Edition         | 1 active + 1 inactive | `march-2026` (active), `march-2025`                    |
| Events          | 5                     | Grand Opening, Tasting Day 1 & 2, Gala Dinner, Closing |
| People          | 5                     | Alice, Bernard, Claire, David, Eva                     |
| Registrations   | 4                     | Pending / Confirmed, Paid / Partial / Unpaid, Checked-in |
| Exhibitors      | 5                     | 3 producers, 1 sponsor, 1 vendor                       |
| Venue / Rooms   | 1 venue, 2 halls      | Brussels Expo — Hall 5 & Hall 6                        |
| Tables          | 3                     | T1 (6-seat), T2 (8-seat), T3 (4-seat)                  |
| Layouts / Areas | 3 layouts, 3 areas    | Hall 5 + Hall 6 layouts                                |

Order and delivery fixtures include:

- table assignments (`registration.table_id` + `table.registration_ids`)
- partial champagne delivery (`ordered 4`, `delivered 2`)
- completed champagne delivery (`ordered 2`, `delivered 2`)

### Scenario switching (demo, regression, screenshot workflows)

Mock mode supports runtime scenario switching without manual data edits:

```bash
curl -s -X POST http://localhost:5173/api/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"scenario":"event-day"}'
```

Available scenarios:

- `default` (base deterministic fixtures)
- `event-day` (check-in and payment states shifted for operational walkthroughs)
- `auth-signed-out`
- `auth-forbidden`
- `auth-expired`
- `auth-invalid`

### Stable routes for AI screenshot agents

Use these routes with `VITE_MSW=true`:

- Public page: `/`
- Admin dashboard root: `/admin`
- Check-in success fixture: `/check-in?id=reg-01#token=mock-token-reg-01`
- Check-in not-found fixture: `/check-in?id=reg-404#token=mock-token-reg-404`
- Guest registrations: `/my-registrations?token=demo-token`

For venue, seating, order, and delivery screenshots, open `/admin` and use the seeded data:

- Venue/Layout views read `/api/venues`, `/api/rooms`, `/api/layouts`, `/api/tables`, `/api/areas`
- Seating is visible via `table.registration_ids`
- Orders and delivery are visible in each registration `order_items` entry
- Switch to `event-day` when you need a “live operations” state snapshot

### Structure

```text
src/mocks/
├── browser.ts          # setupWorker entry point
├── data/               # seed data modules
│   ├── editions.ts
│   ├── exhibitors.ts
│   ├── people.ts
│   ├── registrations.ts
│   └── venue.ts
└── handlers/
    ├── index.ts        # re-exports all handlers
    ├── public.ts       # GET /api/editions/active, GET /api/events,
    │                   # POST /api/registrations, POST /api/check-in/:id
    └── admin.ts        # all admin endpoints (in-memory CRUD, auth guard)
```

The mock is a dynamic import guarded by `import.meta.env.DEV`, so it is **never included in
production builds**.

## Code style guidelines

- **Components**: functional components with TypeScript interfaces; PascalCase filenames
- **State**: React hooks (`useState`, `useContext`)
- **UI**: React Bootstrap components; Bootstrap utility classes for custom styling
- **Types**: strict TypeScript, avoid `any`
- **Imports**: group — React, libraries, components, utils/types
- **i18n**: always use Paraglide message functions, never hardcode user-facing strings

## Navigation

- The main page (`/`) uses hash-based section navigation via `useScrollNavigation`.
- TanStack Router is configured in `src/router.tsx`.
- Route separation:
  - Public marketing site: `/`
  - Admin dashboard: `/admin`
  - Volunteer check-in: `/check-in`
  - Guest self-service registrations: `/my-registrations`
- Route search params:
  - `/check-in` expects optional `id` + `token` string params
  - `/my-registrations` expects an optional `token` string param
- Add navigation items in `src/config/navigation.ts`.

## Query key ownership and invalidation

- All query keys are defined in `src/utils/queryKeys.ts`.
- Top-level admin resources are owned by `queryKeys.admin.*` and consumed by `useAdminQueries`.
- `useAdminQueries` centralizes bulk admin refetch behavior via `shouldRefetchAdminResourceQuery`,
  which only matches the stable top-level admin resources (`registrations`, `tables`, `venues`,
  `rooms`, `table-types`, `layouts`, `exhibitors`, `areas`, `people`, `members`).
- Check-in and self-service flows use route-scoped keys:
  - `queryKeys.checkInRegistration(id, token)`
  - `queryKeys.myRegistrations(token)`

## Technologies

React, Vite (Rolldown), TypeScript, React Bootstrap, Paraglide i18n, Vitest, oxlint
