# Champagne Festival Project - TODO List

## Performance Optimizations
- [ ] Implement additional route-based code splitting for better client bundle size
- [ ] Convert more components to server components where they don't need client-side interactivity
- [x] Add proper image optimization settings for all images (format, sizes, quality)
  - [x] Add priority, sizes, and alt text to key images
  - [x] Create ResponsiveImage component for consistent image handling
  - [ ] Optimize remaining images across the site
- [ ] Add proper caching strategies for API routes
- [ ] Analyze and optimize Core Web Vitals metrics (LCP, FID, CLS)

## Developer Experience
- [ ] Enhance error handling with custom error boundaries
- [ ] Implement more comprehensive logging for debugging
- [ ] Add JSDoc comments to key functions and interfaces
- [ ] Create component and page documentation
- [x] Standardize component prop interfaces for FAQ component
- [ ] Continue standardizing prop interfaces for remaining components
- [x] Create centralized site configuration
- [ ] Remove unused code from the src directory once migration is complete

## Internationalization Improvements
- [x] Evaluate if the current i18n approach can be simplified
- [x] Integrate with next-intl for Next.js-specific i18n solutions
- [x] Migrate components to use next-intl hooks instead of passing dictionaries
- [x] Update Header, Footer, and FAQ components to use next-intl
- [ ] Complete migration from [lang] to [locale] routes
  - [x] Update shared components to use next-intl hooks
  - [x] Fix TypeScript errors in [locale] route
  - [x] Ensure proper HTML lang attribute for each language
  - [ ] Create plan to fully migrate and redirect [lang] routes
- [ ] Remove backward compatibility options from components (lang props, etc.)
- [ ] Remove legacy i18n approach once migration is complete
- [ ] Remove src directory once migration is complete
- [x] Add proper SEO metadata for each language
  - [x] Add structured JSON-LD data for events
  - [x] Add alternate language links for SEO
  - [x] Implement proper OpenGraph and Twitter metadata

## Testing
- [ ] Set up Jest or Vitest for unit testing
- [ ] Add component tests with React Testing Library
- [ ] Implement end-to-end tests with Playwright or Cypress
- [ ] Add automated accessibility testing

## Accessibility
- [ ] Conduct a full accessibility audit
- [x] Ensure all components have proper ARIA attributes
  - [x] Add proper ARIA attributes to Countdown component
  - [x] Add ARIA support to MapComponent
  - [ ] Continue adding ARIA attributes to remaining components
- [ ] Add keyboard navigation support
- [x] Ensure sufficient color contrast
  - [x] Improve color contrast for text on dark backgrounds
  - [x] Enhance focus visibility styles
- [ ] Test with screen readers

## UI/UX Improvements
- [ ] Refine mobile responsiveness
- [ ] Add better loading states and skeletons
- [ ] Implement scroll restoration
- [ ] Consider adding page transitions
- [ ] Optimize form validation UX
- [x] Implement dynamic festival date logic
  - [x] Create automatic festival date calculation based on first weekend rule
  - [x] Add smart visibility for festival information based on current date

## DevOps
- [ ] Add automated CI/CD pipeline
- [x] Implement proper environment variable management
- [ ] Add versioning and changelog
- [ ] Consider containerization with Docker
- [ ] Setup proper deployment environments (staging, production)