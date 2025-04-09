# Champagne Festival Project - TODO List

> **IMPORTANT UPDATE (April 9, 2025)**: The project is now being migrated from Next.js back to a standard React application. This TODO list has been updated to reflect this change.
>
> See [MIGRATION-PLAN.md](./MIGRATION-PLAN.md) for the comprehensive migration strategy and details.

## Performance Optimizations
- [ ] Implement code splitting with React.lazy and Suspense (migration priority)
- [ ] Optimize bundle size with tree shaking and dynamic imports
- [x] Add proper image optimization settings for all images (format, sizes, quality)
  - [x] Add priority, sizes, and alt text to key images
  - [x] Create ResponsiveImage component for consistent image handling
  - [ ] Optimize remaining images across the site
- [ ] Add proper caching strategies for static assets
- [ ] Analyze and optimize Core Web Vitals metrics (LCP, FID, CLS)
- [ ] Implement progressive loading for better performance on low-end devices

## Developer Experience
- [ ] Enhance error handling with custom error boundaries
- [ ] Implement more comprehensive logging for debugging
- [ ] Add JSDoc comments to key functions and interfaces
- [ ] Create component and page documentation
- [x] Standardize component prop interfaces for FAQ component
- [ ] Continue standardizing prop interfaces for remaining components
- [x] Create centralized site configuration
- [ ] Complete the migration from Next.js to React
  - [x] Integrate Schedule component in the main React application

## Internationalization Improvements
- [x] Evaluate if the current i18n approach can be simplified
- [x] ~~Integrate with next-intl for Next.js-specific i18n solutions~~ (No longer applicable)
- [x] ~~Migrate components to use next-intl hooks instead of passing dictionaries~~ (No longer applicable)
- [x] ~~Update Header, Footer, and FAQ components to use next-intl~~ (No longer applicable)
- [x] Implement i18next for React-based internationalization
  - [x] Add i18next and react-i18next packages
  - [x] Add i18next-browser-languagedetector for automatic language detection
  - [ ] Migrate all translations from next-intl to i18next format
  - [ ] Implement language switching UI
- [ ] Migrate SEO metadata to React Helmet or similar solution
  - [ ] Add structured JSON-LD data for events
  - [ ] Implement proper meta tags for SEO

## Testing
- [ ] Set up Vitest for unit testing (migration priority)
- [ ] Add component tests with React Testing Library
- [ ] Implement end-to-end tests with Playwright or Cypress
- [ ] Add automated accessibility testing
- [ ] Create cross-browser testing strategy
- [ ] Add testing coverage reporting

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
- [ ] Add better loading states and skeletons with React Suspense
- [ ] Implement scroll restoration with React Router
- [ ] Add page transitions with Framer Motion or similar library
- [ ] Optimize form validation UX with React Hook Form
- [x] Implement dynamic festival date logic
  - [x] Create automatic festival date calculation based on first weekend rule
  - [x] Add smart visibility for festival information based on current date

## DevOps
- [ ] Add automated CI/CD pipeline (migration priority)
- [x] Implement proper environment variable management
- [ ] Add versioning and changelog
- [ ] Consider containerization with Docker
- [ ] Setup proper deployment environments (staging, production)
- [ ] Update deployment configuration for static site hosting
- [ ] Implement proper monitoring and analytics
- [ ] Create deployment rollback procedures

## Migration Tasks (Next.js to React)
- [x] Set up basic React application structure
- [x] Configure i18next for internationalization
- [x] Migrate all components from Next.js to React
  - [x] Header
  - [x] Footer
  - [x] FAQ
  - [x] ContactForm
  - [x] ContactInfo
  - [x] JsonLd
  - [x] Schedule
  - [x] MapComponent
  - [x] BubbleBackground
  - [x] Carousel
  - [x] PrivacyPolicy
  - [x] Countdown
  - [x] MarqueeSlider
  - [x] SectionHeading
  - [x] ResponsiveImage
- [ ] Finish optimizing the build and deployment configuration for Vite
  - [ ] Configure code splitting for optimal bundle sizes
  - [ ] Implement lazy loading for below-the-fold components
- [ ] Finalize environment variable handling for Vite
- [ ] Remove Next.js specific code and dependencies when ready

### Sprint Priorities (from Migration Plan)
- [ ] **Testing Suite**
  - [ ] Set up Vitest framework
  - [ ] Create basic component tests
  - [ ] Test in all major browsers
  - [ ] Verify screen reader compatibility
- [ ] **Performance Optimization**
  - [ ] Implement React.lazy and Suspense
  - [ ] Optimize image loading
  - [ ] Add lazy loading for below-the-fold content
- [ ] **Infrastructure**
  - [ ] Create CI/CD pipeline for React build
  - [ ] Set up monitoring and analytics
  - [ ] Create rollback plan for production
