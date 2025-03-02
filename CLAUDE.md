# Champagne Festival Project Guidelines

## Build Commands
- `npm run dev`: Start development server (HMR enabled)
- `npm run build`: Create production build
- `npm run preview`: Preview the built application 
- `npm run typecheck`: Run TypeScript check with no emit

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
- **Consistency**: Follow existing patterns in component structure

## Component Structure
- Use React Bootstrap components like Card, Button, Accordion, Modal, Form, etc.
- For custom styling, use Bootstrap utility classes when possible
- Use the `cn()` utility function for conditional class application