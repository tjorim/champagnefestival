# Champagne Festival Migration Plan

> **IMPORTANT UPDATE (April 9, 2025)**: The project is now being migrated from Next.js back to a standard React application. This document serves as the single source of truth for migration information and tasks.

## Overview

The Champagne Festival website is currently being migrated from Next.js back to a standard React application. This document provides a comprehensive view of the migration process, including strategy, progress, and remaining tasks.

## Migration Timeline

1. **Previous Migration (Completed March 10, 2025)** - From custom [lang] to next-intl [locale] approach
2. **Current Migration (In Progress - April 9, 2025)** - From Next.js to standard React application

## Reasons for Migration to React

1. **Simplicity** - Standard React application is simpler to maintain with fewer abstractions
2. **Developer Experience** - React ecosystem is more familiar to the development team
3. **Performance** - Static React application provides sufficient performance without server-side rendering overhead
4. **Deployment** - Static site hosting is simpler and more cost-effective

## Current Status and Tasks

### Completed Tasks

- ✅ Initial React application structure set up in `src/` directory
- ✅ All components successfully migrated from Next.js to React
- ✅ i18next and i18next-browser-languagedetector implemented for internationalization
- ✅ React Bootstrap integrated for UI components
- ✅ Swiper integrated for improved carousel functionality
- ✅ Vite configured for development and production builds
- ✅ Environment variable handling configured for different deployment environments
- ✅ Cloudflare Pages deployment configured via wrangler.toml
- ✅ Proper image optimization settings for all images (format, sizes, quality)
  - ✅ Priority, sizes, and alt text added to key images
  - ✅ ResponsiveImage component created for consistent image handling
- ✅ Standardized component prop interfaces for FAQ component
- ✅ Centralized site configuration
- ✅ ARIA attributes added to key components
  - ✅ Countdown component
  - ✅ MapComponent
- ✅ Color contrast improvements
  - ✅ Text on dark backgrounds
  - ✅ Focus visibility styles
- ✅ Dynamic festival date logic
  - ✅ Automatic festival date calculation based on first weekend rule
  - ✅ Smart visibility for festival information based on current date

### Pending Tasks (By Category)

#### Performance Optimizations
- [ ] Implement code splitting with React.lazy and Suspense (migration priority)
- [ ] Optimize bundle size with tree shaking and dynamic imports
- [ ] Optimize remaining images across the site
- [ ] Add proper caching strategies for static assets
- [ ] Analyze and optimize Core Web Vitals metrics (LCP, FID, CLS)
- [ ] Implement progressive loading for better performance on low-end devices

#### Developer Experience
- [ ] Enhance error handling with custom error boundaries
- [ ] Implement more comprehensive logging for debugging
- [ ] Add JSDoc comments to key functions and interfaces
- [ ] Create component and page documentation
- [ ] Continue standardizing prop interfaces for remaining components

#### Internationalization
- [ ] Migrate all translations from next-intl to i18next format
- [ ] Implement language switching UI
- [ ] Migrate SEO metadata to React Helmet or similar solution
  - [ ] Add structured JSON-LD data for events
  - [ ] Implement proper meta tags for SEO

#### Testing
- [ ] Set up Vitest for unit testing (migration priority)
- [ ] Add component tests with React Testing Library
- [ ] Implement end-to-end tests with Playwright or Cypress
- [ ] Add automated accessibility testing
- [ ] Create cross-browser testing strategy
- [ ] Add testing coverage reporting

#### Accessibility
- [ ] Conduct a full accessibility audit
- [ ] Continue adding ARIA attributes to remaining components
- [ ] Add keyboard navigation support
- [ ] Test with screen readers

#### UI/UX Improvements
- [ ] Refine mobile responsiveness
- [ ] Add better loading states and skeletons with React Suspense
- [ ] Implement scroll restoration with React Router
- [ ] Add page transitions with Framer Motion or similar library
- [ ] Optimize form validation UX with React Hook Form

#### DevOps
- [ ] Add automated CI/CD pipeline (migration priority)
- [ ] Add versioning and changelog
- [ ] Consider containerization with Docker
- [ ] Setup proper deployment environments (staging, production)
- [ ] Update deployment configuration for static site hosting
- [ ] Implement proper monitoring and analytics
- [ ] Create deployment rollback procedures

#### Migration Tasks
- [ ] Finish optimizing the build and deployment configuration for Vite
  - [ ] Configure code splitting for optimal bundle sizes
  - [ ] Implement lazy loading for below-the-fold components
- [ ] Finalize environment variable handling for Vite
- [ ] Remove Next.js specific code and dependencies when ready

### Sprint Priorities
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

## Previous Migration Details: [lang] to [locale] Routes

This section documents the previous migration from the custom [lang] internationalization approach to the next-intl [locale] approach.

### Status (Completed March 10, 2025)

- ✅ All shared components have been migrated to use next-intl hooks
- ✅ Middleware is already configured for next-intl
- ✅ [locale] routes are fully functional with SEO optimizations
- ✅ Proper HTML lang attributes implemented for each language
- ✅ Comprehensive SEO metadata implemented (JSON-LD, OpenGraph, Twitter)
- ✅ Accessibility improvements (ARIA attributes, color contrast, focus styles)
- ✅ Centralized site configuration for better maintainability
- ✅ Dynamic festival date calculation implemented
- ✅ [lang] routes removed

## Current Migration: Technical Details

### Key Technical Changes

#### 1. Internationalization
```tsx
// Before (Next.js with next-intl)
import { useTranslations } from 'next-intl';

function MyComponent() {
  const t = useTranslations('namespace');
  return <h1>{t('title')}</h1>;
}

// After (React with i18next)
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t('namespace.title', 'Default Title')}</h1>;
}
```

#### 2. Routing
```tsx
// Before (Next.js)
import Link from 'next/link';

<Link href="/about">About</Link>

// After (React Router)
import { Link } from 'react-router-dom';

<Link to="/about">About</Link>
```

#### 3. Image Handling
```tsx
// Before (Next.js)
import Image from 'next/image';

<Image 
  src="/images/example.jpg"
  alt="Example"
  width={800}
  height={600}
  priority
/>

// After (React)
import ResponsiveImage from './components/ResponsiveImage';

<ResponsiveImage 
  src="/images/example.jpg"
  alt="Example"
  width={800}
  height={600}
/>
```

#### 4. Data Fetching
```tsx
// Before (Next.js)
export async function getServerSideProps() {
  const res = await fetch('https://api.example.com/data');
  const data = await res.json();
  return { props: { data } };
}

// After (React)
import { useState, useEffect } from 'react';

function MyComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      const res = await fetch('https://api.example.com/data');
      const data = await res.json();
      setData(data);
    }
    fetchData();
  }, []);
  
  if (!data) return <div>Loading...</div>;
  
  return <div>{/* Render data */}</div>;
}
```

#### 5. Build System
- Migrated from Next.js build process to Vite
- Optimized bundle size with chunk splitting and minification
- Environment variables now use Vite's built-in env handling with `VITE_` prefix

##### Vite Configuration Example
```typescript
// vite.config.ts (key parts)
build: {
  outDir: 'dist',
  minify: 'terser',
  sourcemap: mode !== 'production',
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom', 'react-bootstrap', 'react-i18next', 'i18next'],
        leaflet: ['leaflet', 'react-leaflet'],
        swiper: ['swiper', 'swiper/react'],
      },
    }
  }
}
```

##### Environment Variables
Environment variables are managed using Vite's built-in env handling:

1. `.env.development` - Development-specific variables
2. `.env.production` - Production-specific variables
3. `.env.example` - Template for environment setup

Variables must be prefixed with `VITE_` to be accessible in the client code via `import.meta.env.VITE_*`

### Development Commands

- `npm run dev:react` - Start React development server (for the new React implementation)
- `npm run build:react` - Build the React app for production
- `npm run preview:react` - Preview the production build locally
- `npm run deploy:react` - Build and deploy to Cloudflare Pages
- `npm run dev:next` - Start Next.js development server (for the legacy Next.js implementation)
- `npm run build` - Create production build
- `npm run lint` - Run ESLint on the codebase
- `npm run typecheck` - Run TypeScript check with no emit

### Migrated Components

- ✅ Header - Navigation component with language switching
- ✅ Footer - Site footer with copyright and links
- ✅ FAQ - Accordion-based frequently asked questions
- ✅ ContactForm - Form for contacting festival organizers
- ✅ ContactInfo - Display of contact information
- ✅ JsonLd - Structured data for SEO
- ✅ Schedule - Festival schedule with day-based tabs
- ✅ LocationInfo - Venue location information
- ✅ MapComponent - Interactive map with Leaflet integration
- ✅ BubbleBackground - Animated background component
- ✅ Countdown - Festival countdown timer
- ✅ MarqueeSlider - Sliding component for sponsors and producers
- ✅ Carousel - Image carousel component (upgraded to use Swiper)
- ✅ PrivacyPolicy - Privacy policy content
- ✅ ResponsiveImage - Optimized image component
- ✅ SectionHeading - Reusable section heading component

### Migration Strategy

The migration is being done gradually, with both implementations coexisting during the transition:

1. The `app/` directory contains the Next.js implementation
2. The `src/` directory contains the new React implementation
3. All components have been migrated one by one
4. Once testing is complete, the Next.js implementation will be removed

### Benefits of React (Realized)

- ✅ Simpler development workflow
- ✅ Reduced complexity in the codebase
- ✅ Easier onboarding for new developers
- ✅ More direct control over the application
- ✅ Reduced build times
- ✅ Simplified deployment process

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

## How to Contribute

If you're working on this project, here's how you can help with the migration:

1. Check the tasks list in this document for items that need attention
2. Focus on sprint priorities first
3. Update this document to reflect your progress
4. Test thoroughly to ensure the component works as expected

## Testing During Migration

During the migration, you can test the React implementation by running:

```bash
npm run dev:react
```

This will start the development server for the React implementation at http://localhost:5173.

## Deployment

The project is configured for deployment on Cloudflare Pages with:
1. **Direct from GitHub** - Connect repository through Cloudflare dashboard
2. **Manual with Wrangler** - Use included Wrangler configuration and deploy script

Custom domains can be configured through the Cloudflare Pages dashboard after initial deployment.

## Final Evaluation Criteria

Before completely removing the Next.js implementation, ensure:

1. All features work identically in the React implementation
2. Performance metrics meet or exceed the Next.js implementation
3. SEO scores remain consistent
4. Accessibility requirements are fully met
5. All tests pass with high coverage

## Questions and Support

If you have questions about the migration process, please contact the project maintainers.