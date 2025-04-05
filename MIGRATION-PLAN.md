# Migration Plan: [lang] to [locale] Routes

This document outlines the plan for migrating from the custom [lang] internationalization approach to the next-intl [locale] approach.

## Current Status (Updated March 10, 2025)

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

## Migration Steps

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

### 5. Final Clean Up

- Remove any remaining code related to the old approach
- Remove src directory once migration is complete
- Update documentation to reflect the new approach
- Add tests for the new implementation

## Notes

- No need for complex redirections from [lang] to [locale] - we'll make a clean cut
- The next-intl middleware will handle language detection and redirection
- The migration can be done gradually, component by component

## Benefits of next-intl (Already Realized)

- ✅ Better integration with Next.js App Router
- ✅ Type-safe translations with hooks
- ✅ Cleaner component implementation without prop drilling
- ✅ Enhanced SEO support with proper metadata
- ✅ Automatic language detection and redirection
- ✅ Improved performance with server components where possible
- ✅ Centralized configuration for easier maintenance