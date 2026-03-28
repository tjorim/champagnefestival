# Champagne Festival — Frontend

React + Vite SPA for the Champagne Festival website, with TypeScript, Bootstrap, and Paraglide i18n.

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

### Seed data

The mock layer ships with a March 2026 festival edition and realistic seed data across all
resources:

| Resource        | Count                 | Notes                                                  |
| --------------- | --------------------- | ------------------------------------------------------ |
| Edition         | 1 active + 1 inactive | `march-2026` (active), `march-2025`                    |
| Events          | 5                     | Grand Opening, Tasting Day 1 & 2, Gala Dinner, Closing |
| People          | 5                     | Alice, Bernard, Claire, David, Eva                     |
| Registrations   | 3                     | Mix of Pending / Confirmed, Paid / Unpaid, checked-in  |
| Exhibitors      | 5                     | 3 producers, 1 sponsor, 1 vendor                       |
| Venue / Rooms   | 1 venue, 2 halls      | Brussels Expo — Hall 5 & Hall 6                        |
| Tables          | 3                     | T1 (6-seat), T2 (8-seat), T3 (4-seat)                  |
| Layouts / Areas | 2 layouts, 3 areas    | Positioned in Hall 5                                   |

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
- `/admin` and `/check-in` are React Router v7 (`react-router`) routes.
- Add navigation items in `src/config/navigation.ts`.

## Technologies

React, Vite (Rolldown), TypeScript, React Bootstrap, Paraglide i18n, Vitest, oxlint
