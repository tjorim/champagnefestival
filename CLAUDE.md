# Champagne Festival Project Guidelines

## Build Commands
- `npm run dev`: Start Next.js development server 
- `npm run build`: Create production build
- `npm run start`: Start production server
- `npm run lint`: Run ESLint on the codebase
- `npm run typecheck`: Run TypeScript check with no emit

## Code Style Guidelines
- **Imports**: Group imports: React, Next.js, libraries, components, utils/types
- **Components**: Use functional components with TypeScript interfaces
- **Client/Server Components**: Use 'use client' directive for client components
- **UI Framework**: Use React Bootstrap components for UI elements
- **State Management**: Use React hooks (useState, useContext) for state
- **Naming**: PascalCase for components, camelCase for variables/functions
- **Types**: Use strict TypeScript typing, avoid `any`
- **i18n**: Use translation keys with fallback values `t("key", "Fallback")`
- **CSS**: Use Bootstrap classes with consistent color/spacing patterns
- **Layout**: Mobile-first responsive design with Bootstrap grid and utility classes
- **Error Handling**: Use try/catch blocks with user-friendly messages
- **Code Organization**: Group related components in directories
- **Image Optimization**: Use Next.js Image component for optimized images
- **Consistency**: Follow existing patterns in component structure

## Next.js Specific Guidelines
- Use App Router for all routes
- Create a layout.tsx file for consistent layouts
- Use Next.js's built-in data fetching methods when possible
- Add 'use client' directive to components with interactivity
- Use next/image for image optimization
- Use next/link for client-side navigation
- Use metadata API for SEO optimization

## Component Structure
- Use React Bootstrap components like Card, Button, Accordion, Modal, Form, etc.
- For custom styling, use Bootstrap utility classes when possible
- Use the `cn()` utility function for conditional class application