# Champagne Festival Project Guidelines

> **IMPORTANT UPDATE (April 13, 2025)**: The project has been successfully migrated from Next.js back to a standard React application. All Next.js code has been removed.

## Build Commands
- `npm run dev`: Start React development server
- `npm run build`: Create production build
- `npm run lint`: Run ESLint on the codebase
- `npm run typecheck`: Run TypeScript check with no emit

## Important Notes
- The project is a standard React application using Vite as the build tool
- The `src/` directory contains all application code

## Code Style Guidelines
- **Imports**: Group imports: React, libraries, components, utils/types
- **Components**: Use functional components with TypeScript interfaces
- **UI Framework**: Use React Bootstrap components for UI elements
- **State Management**: Use React hooks (useState, useContext) for state
- **Naming**: PascalCase for components, camelCase for variables/functions
- **Types**: Use strict TypeScript typing, avoid `any`
- **i18n**: Use translation keys with fallback values `t("key", "Fallback")`
- **CSS**: Use Bootstrap classes with consistent color/spacing patterns
- **Layout**: Mobile-first responsive design with Bootstrap grid and utility classes
- **Error Handling**: Use try/catch blocks with user-friendly messages
- **Code Organization**: Group related components in directories
- **Image Handling**: Use the ResponsiveImage component for consistent image handling
- **Consistency**: Follow existing patterns in component structure

## React Specific Guidelines
- Use hash-based navigation with anchor links (no React Router - single-page application)
- Navigation is handled by the custom `useScrollNavigation` hook for smooth scrolling and URL updates
- Use navigation configuration from `src/config/navigation.ts` for consistent routing
- Implement code splitting with React.lazy and Suspense
- Use i18next for internationalization
- Implement error boundaries for graceful error handling
- Use React.memo for performance optimization when appropriate
- Implement proper state management with React hooks

## Navigation Guidelines
- **Single-Page Application**: All content is rendered in one page with section-based navigation
- **Hash Links**: Use anchor links with `href="#section-id"` format for navigation
- **Navigation Config**: Add new navigation items to `src/config/navigation.ts`
- **Scroll Navigation**: The `useScrollNavigation` hook automatically handles:
  - Smooth scrolling to target sections
  - URL hash updates when scrolling between sections
  - ARIA attributes for accessibility
  - Performance-optimized scroll event handling
- **Section IDs**: Ensure all main sections have unique `id` attributes for navigation
- **Modal Navigation**: Special hash links like `#privacy-policy` can trigger modals

## Component Structure
- Use React Bootstrap components like Card, Button, Accordion, Modal, Form, etc.
- For custom styling, use Bootstrap utility classes when possible
- Use the `classnames` utility for conditional class application
- Implement proper prop types with TypeScript interfaces
- Use React.Fragment to avoid unnecessary DOM elements

