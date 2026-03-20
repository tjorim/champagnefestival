# Champagne Festival Project Guidelines

## Build Commands

Run all frontend commands from the `frontend/` directory:

- `pnpm dev`: Start React development server
- `pnpm build`: Create production build
- `pnpm lint`: Run ESLint on the codebase
- `pnpm typecheck`: Run TypeScript check with no emit

## Important Notes

- The project is a standard React application using Vite as the build tool
- The `frontend/` directory contains all frontend code; `src/` lives inside it

## Code Style Guidelines

- **Imports**: Group imports: React, libraries, components, utils/types
- **Components**: Use functional components with TypeScript interfaces
- **UI Framework**: Use React Bootstrap components for UI elements
- **State Management**: Use React hooks (useState, useContext) for state
- **Naming**: PascalCase for components, camelCase for variables/functions
- **Types**: Use strict TypeScript typing, avoid `any`
- **i18n**: Use Paraglide message functions — `import * as m from '../paraglide/messages.js'` then call `m.key_name()`
- **CSS**: Use Bootstrap classes with consistent color/spacing patterns
- **Layout**: Mobile-first responsive design with Bootstrap grid and utility classes
- **Error Handling**: Use try/catch blocks with user-friendly messages
- **Code Organization**: Group related components in directories
- **Image Handling**: Use the ResponsiveImage component for consistent image handling
- **Consistency**: Follow existing patterns in component structure

## React Specific Guidelines

- The main marketing site uses hash-based navigation with anchor links handled by the `useScrollNavigation` hook. **Exception**: dedicated sub-pages (`/admin`, `/check-in`) use React Router v7 (`react-router`) with `BrowserRouter` and real URL paths.
- Use navigation configuration from `frontend/src/config/navigation.ts` for consistent routing
- Implement code splitting with React.lazy and Suspense
- Use Paraglide (`@inlang/paraglide-js`) for internationalization
- Implement error boundaries for graceful error handling
- Use React.memo for performance optimization when appropriate
- Implement proper state management with React hooks

## Navigation Guidelines

- **Single-Page Application**: The main marketing page (`/`) uses section-based navigation with hash fragments.
- **Hash Links**: Use anchor links with `href="#section-id"` format for navigation within the main page.
- **Navigation Config**: Add new navigation items to `frontend/src/config/navigation.ts`
- **Scroll Navigation**: The `useScrollNavigation` hook automatically handles:
  - Smooth scrolling to target sections
  - URL hash updates when scrolling between sections
  - ARIA attributes for accessibility
  - Performance-optimized scroll event handling
- **React Router routes**: `/admin` and `/check-in` are standalone React Router routes rendered outside the main SPA. The check-in route uses `useSearchParams()` to read `?id=...&token=...` query parameters — this is intentional and correct for QR-code deep-link URLs (real path + query string, not hash fragments).
- **Section IDs**: Ensure all main sections have unique `id` attributes for navigation
- **Modal Navigation**: Special hash links like `#privacy-policy` can trigger modals

## Component Structure

- Use React Bootstrap components like Card, Button, Accordion, Modal, Form, etc.
- For custom styling, use Bootstrap utility classes when possible
- Use the `classnames` utility for conditional class application
- Implement proper prop types with TypeScript interfaces
- Use React.Fragment to avoid unnecessary DOM elements
