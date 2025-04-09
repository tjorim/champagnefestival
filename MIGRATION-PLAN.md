# Migration Plan: Next.js to React

> **IMPORTANT UPDATE (April 9, 2025)**: The project is now being migrated from Next.js back to a standard React application. This document has been updated to reflect this change.

## Previous Migration (Completed): [lang] to [locale] Routes

This section documents the previous migration from the custom [lang] internationalization approach to the next-intl [locale] approach.

### Status (Completed March 10, 2025)

- ✅ All shared components have been migrated to use next-intl hooks:
  - Header (uses useLocale hook)
  - Footer
  - FAQ (uses config for structure but translations from hooks)
  - ContactForm
  - ContactInfo
  - LocationInfo
  - PrivacyPolicy
  - Schedule
  - MapComponent
  - Countdown
  - BubbleBackground
  - MarqueeSlider
- ✅ Middleware is already configured for next-intl
- ✅ [locale] routes are fully functional with SEO optimizations
- ✅ Proper HTML lang attributes implemented for each language
- ✅ Comprehensive SEO metadata implemented (JSON-LD, OpenGraph, Twitter)
- ✅ Accessibility improvements (ARIA attributes, color contrast, focus styles)
- ✅ Centralized site configuration for better maintainability
- ✅ Dynamic festival date calculation implemented 
- ❌ [lang] routes still exist and use the old approach

### Migration Steps (Completed)

### 1. Complete Component Migration ✅

- ✅ Ensure all components use the next-intl hooks
- ✅ Remove dictionary prop passing in the [locale] routes
- ✅ Test all components in the [locale] routes to ensure they work properly

### 2. Update Root Page ✅

- ✅ Removal of root page.tsx since middleware handles redirection
- ✅ Proper language detection and redirection through next-intl middleware
- ✅ Language preferences respected through the Accept-Language header and cookies
- ✅ Default language (Dutch) used as fallback

### 3. SEO and Link Optimization ✅

- ✅ Links updated to use the Link component from next-intl navigation
- ✅ SEO metadata fully implemented for [locale] routes:
  - ✅ Title and description with proper translations
  - ✅ OpenGraph and Twitter card metadata
  - ✅ JSON-LD structured data for event information
  - ✅ Alternate language links and canonical URLs
  - ✅ Proper HTML lang attributes for accessibility

### 4. Remove [lang] Routes ✅

All testing is complete and we're confident the [locale] routes are working properly:

```bash
# Remove the [lang] routes
rm -rf app/[lang]  # COMPLETED on March 10, 2025
```

### 5. Final Clean Up (No Longer Applicable)

~~- Remove any remaining code related to the old approach~~
~~- Remove src directory once migration is complete~~
~~- Update documentation to reflect the new approach~~
~~- Add tests for the new implementation~~

> Note: The src directory is now being used for the React implementation.

## Current Migration: Next.js to React

This section outlines the plan for migrating from Next.js back to a standard React application.

### Current Status (Updated April 9, 2025)
- ✅ Initial React application structure set up in `src/` directory
- ✅ All components successfully migrated from Next.js to React
- ✅ i18next and i18next-browser-languagedetector implemented for internationalization
- ✅ React Bootstrap integrated for UI components
- ✅ Swiper integrated for improved carousel functionality
- ✅ Vite configured for development and production builds with optimal chunk splitting
- ✅ Environment variable handling configured for different deployment environments
- ✅ Cloudflare Pages deployment configured via wrangler.toml
- ❌ Comprehensive testing of all components in the React environment
- ❌ Performance monitoring and comparison with Next.js implementation
- ❌ Remove Next.js specific code and dependencies

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
- ❌ Add smooth scrolling between sections
- ❌ Implement history API for better back/forward navigation with hash changes

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

- ❌ Remove Next.js specific files and directories (app/, middleware.ts, etc.)
- ❌ Remove Next.js specific dependencies from package.json
- ❌ Update documentation to reflect the new React architecture
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

### Rollout Strategy

To ensure a smooth transition from Next.js to React, we will follow this staged rollout approach:

1. **Alpha Testing Phase** (Current):
   - Internal testing with the development team
   - Fix any critical issues identified

2. **Beta Testing Phase**:
   - Limited release to select users/stakeholders
   - Gather feedback and make adjustments
   - Monitor performance metrics compared to Next.js implementation

3. **Progressive Rollout**:
   - Gradually increase traffic to the React implementation
   - Start with 10%, monitor, then increase to 25%, 50%, and finally 100%
   - Use feature flags to control the rollout

4. **Full Cutover**:
   - Complete transition to React implementation
   - Remove Next.js code and dependencies
   - Archive the Next.js implementation for reference

### Final Evaluation Criteria

Before completely removing the Next.js implementation, ensure:

1. All features work identically in the React implementation
2. Performance metrics meet or exceed the Next.js implementation:
   - Core Web Vitals (LCP, FID, CLS) within good thresholds
   - Bundle size optimized and loading times comparable or better
   - Low-end device performance validated
3. SEO scores remain consistent across search engines
4. Accessibility requirements are fully met (WCAG 2.1 AA compliance)
5. Cross-browser compatibility verified across modern browsers
6. All tests pass with high coverage (>80% minimum)
