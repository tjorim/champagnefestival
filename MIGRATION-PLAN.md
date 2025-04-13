# Migration Plan: Next.js to React

> **IMPORTANT UPDATE (April 13, 2025)**: The project has been successfully migrated from Next.js back to a standard React application. This document serves as both historical record and future task planning.

## Historical Note: Previous Next.js Migrations

The project previously used Next.js with different internationalization approaches:
1. Initially used custom `[lang]` route parameters
2. Later migrated to Next.js's `next-intl` with `[locale]` routes
3. Finally migrated from Next.js to React with i18next

These historical migrations informed our current approach to internationalization in the React implementation.

> **Note**: This section is maintained for historical context only. The Next.js implementation, including all `app/` directory code, has been completely removed as of April 13, 2025.

## Completed Migration: Next.js to React

This section documents the completed migration from Next.js back to a standard React application, along with upcoming tasks to enhance the React implementation.

### Current Status (Updated April 13, 2025)
- ✅ Initial React application structure set up in `src/` directory
- ✅ All components successfully migrated from Next.js to React
- ✅ i18next and i18next-browser-languagedetector implemented for internationalization
- ✅ React Bootstrap integrated for UI components
- ✅ Swiper integrated for improved carousel functionality
- ✅ Vite configured for development and production builds with optimal chunk splitting
- ✅ Environment variable handling configured for different deployment environments
- ✅ Cloudflare Pages deployment configured via wrangler.toml
- ✅ Remove Next.js specific code and dependencies
- ❌ Comprehensive testing of all components in the React environment
- ❌ Performance monitoring and comparison with previous implementation

### Migration Steps

#### 1. Setup React Application Structure

- ✅ Create basic React application structure in `src/` directory
- ✅ Set up i18next for internationalization
- ✅ Configure build tools for React

#### 2. Component Migration

- ✅ Migrate shared components to React - COMPLETED
  - ✅ Header
  - ✅ Footer
  - ✅ FAQ
  - ✅ ContactForm
  - ✅ ContactInfo
  - ✅ JsonLd
  - ✅ Schedule
  - ✅ LocationInfo
  - ✅ MapComponent
  - ✅ BubbleBackground
  - ✅ Countdown
  - ✅ MarqueeSlider
  - ✅ Carousel (upgraded to use Swiper)
  - ✅ PrivacyPolicy
  - ✅ ResponsiveImage
  - ✅ SectionHeading
- ✅ Update component imports to use relative paths in the React structure
- ✅ Remove Next.js specific code from components (e.g., 'use client' directives)

#### 3. Navigation and Section Handling

- ✅ Maintain single-page application structure with anchor links
- ✅ Implement language switching with i18next
- ✅ Keep privacy policy as a modal dialog rather than a separate page
- ✅ Add smooth scrolling between sections
- ✅ Implement history API for better back/forward navigation with hash changes

#### 4. Build and Deployment

- ✅ Configure Vite for development and production builds
- ✅ Optimize bundle size with chunk splitting and minification
- ✅ Set up environment variables for different deployment environments
- ✅ Configure Cloudflare Pages deployment via wrangler.toml
- ❌ Set up CI/CD pipeline for automated testing and deployment
- ❌ Configure proper caching strategies for static assets

#### 5. Testing and Quality Assurance

- ❌ Set up Vitest for unit testing
- ❌ Implement component tests with React Testing Library
- ❌ Conduct cross-browser testing
- ❌ Verify accessibility compliance
- ❌ Perform performance testing and optimization
- ❌ Test internationalization in all supported languages

#### 6. Final Clean Up

- ✅ Remove Next.js specific files and directories (app/, middleware.ts, etc.)
- ✅ Remove Next.js specific dependencies from package.json
- ✅ Update documentation to reflect the new React architecture
- ❌ Create developer onboarding guide for the React implementation

### Benefits of React (Realized)

- ✅ Simpler development workflow
- ✅ Reduced complexity in the codebase
- ✅ Easier onboarding for new developers
- ✅ More direct control over the application
- ✅ Reduced build times
- ✅ Simplified deployment process

### Upcoming Sprint Priorities

1. **Comprehensive Testing Suite**:
   - Set up Vitest and implement basic component tests
   - Verify correct functionality in all major browsers
   - Test screen reader compatibility

2. **Performance Optimization**:
   - Implement code splitting with React.lazy and Suspense
   - Optimize image loading with proper sizing and formats
   - Add native lazy loading for below-the-fold content

3. **Final Infrastructure Transition**:
   - Move CI/CD pipeline to build React version by default
   - Update monitoring and analytics for the React implementation
   - Create rollback plan in case of unexpected issues

### Potential Challenges and Mitigations

1. **SEO Impact**:
   - Challenge: Moving from SSR to client-side rendering may impact SEO
   - Mitigation: Implement thorough meta tags, ensure JSON-LD is correct, test with search console

2. **Performance on Low-End Devices**:
   - Challenge: Client-side rendering can be slower on low-end devices
   - Mitigation: Implement progressive loading, optimize bundle size, and use performance monitoring

3. **Browser Compatibility**:
   - Challenge: Features might not work consistently across browsers
   - Mitigation: Create a browser compatibility matrix, test thoroughly, add polyfills as needed

### Final Steps Before Launch

Since the site hasn't gone live yet, we can focus on these key areas before the initial public launch:

1. **Testing**:
   - Cross-browser testing on major browsers (Chrome, Firefox, Safari, Edge)
   - Mobile device testing (iOS and Android)
   - Accessibility validation

2. **Performance Optimization**:
   - Core Web Vitals optimization (LCP, FID, CLS)
   - Image optimization
   - Bundle size analysis and reduction

3. **SEO Verification**:
   - Structured data validation
   - Meta tags implementation
   - Sitemap generation

### Project Timeline

Based on current progress and project priorities, here is the updated timeline for the remaining pre-launch tasks:

| Date | Milestone |
|------|-----------|
| April 13, 2025 | ✅ **Complete migration**: Remove Next.js implementation |
| April 20, 2025 | Finalize performance optimization and bundle analysis |
| April 25, 2025 | Complete cross-browser testing and implement fixes |
| May 1, 2025 | Final content review and accessibility validation |
| May 10, 2025 | **Site Launch**: Official public launch |

**IMPORTANT**: All development now occurs exclusively in the React implementation. The Next.js code has been completely removed from the codebase as of April 13, 2025, ahead of schedule.
