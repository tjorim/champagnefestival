# Champagne Festival Project Guidelines

> **IMPORTANT UPDATE (April 9, 2025)**: The project is now being migrated from Next.js back to a standard React application. These guidelines have been updated to reflect this change.

## Build Commands
- `npm run dev:react`: Start React development server (for the new React implementation)
- `npm run dev:next`: Start Next.js development server (for the legacy Next.js implementation)
- `npm run build`: Create production build
- `npm run lint`: Run ESLint on the codebase
- `npm run typecheck`: Run TypeScript check with no emit

## Important Notes
- The project is currently in a transition phase from Next.js to React
- The `src/` directory contains the new React implementation
- The `app/` directory contains the legacy Next.js implementation
- Focus on developing in the React implementation unless specifically working on the Next.js version

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
- Use React Router for client-side routing
- Implement code splitting with React.lazy and Suspense
- Use i18next for internationalization
- Implement error boundaries for graceful error handling
- Use React.memo for performance optimization when appropriate
- Implement proper state management with React hooks

## Component Structure
- Use React Bootstrap components like Card, Button, Accordion, Modal, Form, etc.
- For custom styling, use Bootstrap utility classes when possible
- Use the `classnames` utility for conditional class application
- Implement proper prop types with TypeScript interfaces
- Use React.Fragment to avoid unnecessary DOM elements

## Legacy Next.js Guidelines (for reference only)
> These guidelines apply only to the legacy Next.js implementation in the `app/` directory.

- Use App Router for all routes
- Create a layout.tsx file for consistent layouts
- Use Next.js's built-in data fetching methods when possible
- Add 'use client' directive to components with interactivity
- Use next/image for image optimization
- Use next/link for client-side navigation
- Use metadata API for SEO optimization
