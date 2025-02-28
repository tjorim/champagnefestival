# Champagne Festival Project Guidelines

## Build Commands
- `npm run dev`: Start development server (HMR enabled)
- `npm run build`: Create production build
- `npm run start`: Run the built application
- `npm run typecheck`: Generate types and run TypeScript check

## Code Style Guidelines
- **Imports**: Group imports: React, libraries, components, utils/types
- **Components**: Use functional components with TypeScript interfaces
- **State Management**: Use React hooks (useState, useContext) for state
- **Naming**: PascalCase for components, camelCase for variables/functions
- **Types**: Use strict TypeScript typing, avoid `any`
- **i18n**: Use translation keys with fallback values `t("key", "Fallback")`
- **CSS**: Use Tailwind classes with consistent color/spacing patterns
- **Layout**: Mobile-first responsive design with Tailwind breakpoints
- **Error Handling**: Use try/catch blocks with user-friendly messages
- **Code Organization**: Group related components in directories
- **Consistency**: Follow existing patterns in component structure