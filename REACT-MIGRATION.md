# Migration from Next.js to React

This document provides detailed information about the migration from Next.js back to a standard React application.

## Background

The Champagne Festival website was originally built with React, then migrated to Next.js with next-intl for internationalization. We are now migrating back to a standard React application for the following reasons:

1. **Simplicity**: A standard React application is simpler to maintain and develop, with fewer abstractions and complexities.
2. **Developer Experience**: The React ecosystem is more familiar to our development team.
3. **Performance**: For our specific use case, a static React application provides sufficient performance without the overhead of server-side rendering.
4. **Deployment**: Static site hosting is simpler and more cost-effective for our needs.

## Migration Strategy

The migration is being done gradually, with both implementations coexisting during the transition:

1. The `app/` directory contains the Next.js implementation
2. The `src/` directory contains the new React implementation
3. Components are being migrated one by one
4. Once all components are migrated, the Next.js implementation will be removed

## Key Changes

### 1. Internationalization

- **Before**: Used next-intl with Next.js middleware for server-side language detection
- **After**: Using i18next with browser language detection
  
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

### 2. Routing

- **Before**: Used Next.js App Router with file-based routing
- **After**: Using React Router for client-side routing

```tsx
// Before (Next.js)
import Link from 'next/link';

<Link href="/about">About</Link>

// After (React Router)
import { Link } from 'react-router-dom';

<Link to="/about">About</Link>
```

### 3. Image Handling

- **Before**: Used Next.js Image component for optimization
- **After**: Using standard HTML img tags with the ResponsiveImage component

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

### 4. Data Fetching

- **Before**: Used Next.js data fetching methods (getServerSideProps, etc.)
- **After**: Using React hooks (useState, useEffect) with fetch API or Axios

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
### 5. Build and Deployment

- **Before**: Used Next.js build process with server components
- **After**: Using Vite for development and building

#### Vite Configuration

The build process has been configured with Vite to optimize for production:

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

#### Environment Variables

Environment variables are managed using Vite's built-in env handling:

1. `.env.development` - Development-specific variables
2. `.env.production` - Production-specific variables
3. `.env.example` - Template for environment setup

Variables must be prefixed with `VITE_` to be accessible in the client code via `import.meta.env.VITE_*`

#### Scripts

The following npm scripts are available for the React implementation:

- `npm run dev:react` - Start the Vite dev server
- `npm run build:react` - Build the React app for production
- `npm run preview:react` - Preview the production build locally
- `npm run deploy:react` - Build and deploy to Cloudflare Pages

### 6. Component Migration Status

As of April 9, 2025, the following components have been successfully migrated:

- ✅ Header - Navigation component with language switching
- ✅ Footer - Site footer with copyright and links
- ✅ FAQ - Accordion-based frequently asked questions
- ✅ ContactForm - Form for contacting festival organizers
- ✅ ContactInfo - Display of contact information
- ✅ JsonLd - Structured data for SEO
- ✅ Schedule - Festival schedule with day-based tabs
- ✅ MarqueeSlider - Sliding component for sponsors and producers
- ✅ LocationInfo - Venue location information
- ✅ ResponsiveImage - Optimized image component
- ✅ SectionHeading - Reusable section heading component
Components that still need to be migrated:
- ✅ MapComponent - Interactive map with Leaflet integration
- ✅ BubbleBackground - Animated background component
- ✅ Carousel - Image carousel component for sponsors
- ✅ PrivacyPolicy - Privacy policy content
- ✅ Countdown - Festival countdown timer
- ❌ Countdown - Festival countdown timer

## Migration Progress

See the [TODO.md](./TODO.md) file for the current migration progress and remaining tasks. The React implementation now has scripts for development, building, and deployment using Vite.
See the [TODO.md](./TODO.md) file for the current migration progress and remaining tasks.

## How to Contribute

If you're working on this project, here's how you can help with the migration:

1. Check the TODO.md file for components that need to be migrated
2. Migrate one component at a time, ensuring it works correctly in the React implementation
3. Update the TODO.md file to reflect your progress
4. Test thoroughly to ensure the component works as expected

## Testing During Migration

During the migration, you can test the React implementation by running:

```bash
npm run dev:react
```

This will start the development server for the React implementation.

## Questions and Support

If you have questions about the migration process, please contact the project maintainers.
