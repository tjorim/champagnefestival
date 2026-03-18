# Champagne Festival Website

This is the official website for the Champagne Festival, built with React and React Bootstrap.

> **IMPORTANT UPDATE (April 13, 2025)**: This project has been successfully migrated from Next.js back to a standard React application. The Next.js code has been removed.

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result.

## Project Structure

- `src/` - React application source code
  - `src/components/` - React components used throughout the application
  - `src/config/` - Configuration files for different aspects of the website
  - `messages/` - Translation files for i18n (one JSON per locale)
  - `src/types/` - TypeScript type definitions
  - `src/tests/` - Test files for components and utilities
- `public/` - Static assets like images

## Browser Compatibility

This project targets modern browsers with good support for ES2020 features:

| Browser         | Minimum Version |
| --------------- | --------------- |
| Chrome          | 85+             |
| Firefox         | 80+             |
| Safari          | 14+             |
| Edge (Chromium) | 85+             |
| iOS Safari      | 14+             |
| Android Chrome  | 85+             |

We do not support Internet Explorer or legacy Edge (non-Chromium).

The project uses modern JavaScript features without extensive polyfills to maintain performance and reduce bundle size. For the small percentage of users on older browsers, we provide a basic experience notification suggesting they upgrade.

## Technologies Used

- React - JavaScript library for building user interfaces
- React Bootstrap - UI component library
- Paraglide (`@inlang/paraglide-js`) - Compile-time i18n library
- TypeScript - Type-safe JavaScript

## Internationalization

The project uses [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) (`@inlang/paraglide-js`) for compile-time i18n. Translations are stored as flat JSON files in `messages/{locale}.json` (locales: `nl`, `en`, `fr`; base: `nl`).

When developing, import the generated message functions:

```tsx
import * as m from "../paraglide/messages.js";

function MyComponent() {
  return <h1>{m.welcome_title()}</h1>;
}
```

To switch locale at runtime, use the runtime helpers:

```tsx
import { getLocale, setLocale } from "../paraglide/runtime.js";
```

To add or update translations, edit the files in `messages/` and run `npm run paraglide:compile`.

## Development Guidelines

1. Follow the established code style
2. Use React Bootstrap components for UI elements
3. Add translations for all user-facing text
4. Ensure mobile-first responsiveness
5. Add meaningful comments for complex logic

## Security Enhancements and Best Practices

### Image Handling

With the migration to React, we're using standard HTML `<img>` tags with the `ResponsiveImage` component for consistent image handling across the application.

```tsx
import ResponsiveImage from "./components/ResponsiveImage";

<ResponsiveImage src="/images/example.jpg" alt="Example image" width={800} height={600} />;
```

### Contact Information Configuration

Contact information has been moved from hardcoded values in dictionary files to environment variables for improved security and easier updates:

1. Create a `.env.local` file with the following variables:

> **Note:** The values shown below are examples/placeholders. Replace them with your actual contact information and configuration.

```bash
# Contact information
CONTACT_EMAIL=your-email@example.com
SENDER_EMAIL=your-sender@example.com
INFO_EMAIL=your-info@example.com
MAIN_PHONE=+32123456789

# Social media handles
FACEBOOK_HANDLE=your.facebook.handle

# Location information
VENUE_NAME=Your Venue Name
VENUE_ADDRESS=Your Address
VENUE_CITY=Your City
VENUE_POSTAL_CODE=1234
VENUE_COUNTRY=Your Country
VENUE_OPENING_HOURS=See program
VENUE_LAT=51.2345
VENUE_LNG=2.9876

# Other configuration
VITE_PUBLIC_URL=https://your-domain.com
```

2. Use the new components to display contact and location information from the configuration:

```tsx
// For contact information
import ContactInfo from "../components/ContactInfo";
<ContactInfo />;

// For location information
import LocationInfo from "../components/LocationInfo";
<LocationInfo />;

// For maps with coordinates from configuration
import MapComponent from "../components/MapComponent";
```

### Maintenance Guidelines

1. **Environment Variables**:
   - Always use environment variables for sensitive information
   - For local development, use `.env.local` (already in .gitignore)
   - For production, set environment variables in your hosting platform

2. **Image Sources**:
   - When adding new external image sources, ensure they're from trusted sources
   - Consider using content security policies to restrict image sources
   - Only add trusted and necessary image sources

3. **Contact Information**:
   - Update contact details by changing environment variables
   - Never hardcode contact information in source files or translations
   - Use the `ContactInfo` component for consistent display of contact information
4. **Event Schedule**:
   - Update the schedule in `src/config/schedule.ts` for upcoming events
   - The schedule is structured with festival days and events with detailed timing
   - For translations, update the event titles and descriptions in the locale files under `messages/{locale}.json`

## Deployment

Production deployment is standardized on **GitHub Pages** via the GitHub Actions workflow in [`./.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).

Deploys are triggered when you publish a GitHub Release (or by manually running the workflow from the Actions tab).

For local validation before release, run:

```bash
npm ci
npm run lint
npm run test
npm run build
```

This creates a production build in `dist/`.

For the exact production deployment flow and required GitHub repository settings, see [DEPLOYMENT.md](./DEPLOYMENT.md).
