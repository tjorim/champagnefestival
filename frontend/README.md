# Champagne Festival — Frontend

React + Vite SPA for the Champagne Festival website, with TypeScript, Bootstrap, and Paraglide i18n.

## Quick start

```bash
cd frontend
pnpm install        # install dependencies
pnpm dev            # dev server → http://localhost:5173
```

The dev server proxies `/api/*` to `http://localhost:8000` (backend).

## Available scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Production build → `dist/` |
| `pnpm preview` | Preview the production build locally |
| `pnpm lint` | Run oxlint |
| `pnpm format` | Format with Prettier |
| `pnpm typecheck` | TypeScript check (no emit) |
| `pnpm test` | Run tests with Vitest |
| `pnpm test:ui` | Vitest with browser UI |
| `pnpm paraglide:compile` | Regenerate i18n message functions from `messages/` |

## Project structure

```
frontend/
├── messages/          # i18n translation files (nl.json, en.json, fr.json)
├── public/            # static assets (images, fonts, …)
└── src/
    ├── components/    # React components (feature sub-directories)
    ├── config/        # site configuration (schedule, navigation, …)
    ├── hooks/         # custom React hooks
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
<h1>{m.welcome_title()}</h1>
```

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
