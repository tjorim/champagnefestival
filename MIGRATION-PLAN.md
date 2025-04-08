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
- ✅ Basic components migrated to React
- ✅ i18next and i18next-browser-languagedetector added for internationalization
- ✅ React Bootstrap integrated for UI components
- ❌ Complete migration of all components from Next.js to React
- ❌ Update all imports and references to use the new structure
- ❌ Remove Next.js specific code and dependencies

### Migration Steps

#### 1. Setup React Application Structure

- ✅ Create basic React application structure in `src/` directory
- ✅ Set up i18next for internationalization
- ✅ Configure build tools for React

#### 2. Component Migration

- ✅ Migrate shared components to React
  - ✅ Header
  - ✅ Footer
  - ✅ FAQ
  - ✅ ContactForm
  - ✅ ContactInfo
  - ✅ JsonLd
  - ✅ Schedule
  - ✅ LocationInfo
  - ✅ MarqueeSlider
  - ✅ ResponsiveImage
  - ✅ SectionHeading
  - ❌ Remaining components (BubbleBackground, MapComponent, Countdown, etc.)
- ⏳ Update component imports to use the new structure (in progress)
- ⏳ Remove Next.js specific code from components (in progress)

#### 3. Routing and Navigation

- ❌ Implement React Router for client-side routing
- ❌ Create route components for each page
- ❌ Implement language switching with i18next

#### 4. Build and Deployment

- ❌ Update build configuration for React
- ❌ Configure deployment for static hosting
- ❌ Update CI/CD pipeline for the new build process

#### 5. Final Clean Up

- ❌ Remove Next.js specific files and directories
- ❌ Remove Next.js specific dependencies
- ❌ Update documentation to reflect the new approach
- ❌ Add tests for the React implementation

### Notes

- The migration will be done gradually, component by component
- Both implementations will coexist during the migration
- The React implementation will eventually replace the Next.js implementation

### Benefits of React (Expected)

- ⏳ Simpler development workflow
- ⏳ Reduced complexity in the codebase
- ⏳ Easier onboarding for new developers
- ⏳ More direct control over the application
- ⏳ Reduced build times
- ⏳ Simplified deployment process
