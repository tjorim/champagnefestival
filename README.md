# Champagne Festival Website

This is the official website for the Champagne Festival, built with Next.js and React Bootstrap.

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `app/` - Next.js App Router directory containing all page components and layouts
- `app/components/` - React components used throughout the application
- `app/config/` - Configuration files for different aspects of the website
- `app/translations/` - Translation files for i18n
- `public/` - Static assets like images

## Technologies Used

- Next.js - React framework for server-rendered applications
- React Bootstrap - UI component library
- i18next - Internationalization library
- TypeScript - Type-safe JavaScript

## Development Guidelines

1. Follow the established code style
2. Use React Bootstrap components for UI elements
3. Add translations for all user-facing text
4. Ensure mobile-first responsiveness
5. Add meaningful comments for complex logic

## Security Enhancements and Best Practices

### Image Domain Configuration

We've updated the image configuration in `next.config.ts` to use the more secure `remotePatterns` approach instead of the deprecated `domains` array. This provides more granular control over which external image sources are allowed.

```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'placehold.co',
      pathname: '/**',
    },
    // Additional trusted image sources can be added here
  ],
  dangerouslyAllowSVG: true,
  contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
}
```

### Contact Information Configuration

Contact information has been moved from hardcoded values in dictionary files to environment variables for improved security and easier updates:

1. Create a `.env.local` file with the following variables:
```
# Contact information
CONTACT_EMAIL=nancy.cattrysse@telenet.be
SENDER_EMAIL=nancy.cattrysse@telenet.be
INFO_EMAIL=nancy.cattrysse@telenet.be
MAIN_PHONE=+32478480177

# Social media handles
FACEBOOK_HANDLE=champagnefestival.kust

# Location information
VENUE_NAME=Meeting- en eventcentrum Staf Versluys
VENUE_ADDRESS=Kapelstraat 76
VENUE_CITY=Bredene
VENUE_POSTAL_CODE=8450
VENUE_COUNTRY=België
VENUE_OPENING_HOURS=Zie programma
VENUE_LAT=51.23601
VENUE_LNG=2.97328

# Other configuration
NEXT_PUBLIC_BASE_URL=https://www.champagnefestival.be
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

2. Use the new components to display contact and location information from the configuration:
```tsx
// For contact information
import ContactInfo from "@/app/components/ContactInfo";
<ContactInfo dictionary={dict} />

// For location information
import LocationInfo from "@/app/components/LocationInfo";
<LocationInfo dictionary={dict} />

// For maps with coordinates from configuration
import MapComponent from "@/app/components/MapComponent";
<MapComponent />
```

### Maintenance Guidelines

1. **Environment Variables**: 
   - Always use environment variables for sensitive information
   - For local development, use `.env.local` (already in .gitignore)
   - For production, set environment variables in your hosting platform

2. **Image Sources**:
   - When adding new external image sources, update `remotePatterns` in `next.config.ts`
   - Avoid using the deprecated `domains` array
   - Only add trusted and necessary image sources

3. **Contact Information**:
   - Update contact details by changing environment variables
   - Never hardcode contact information in source files or translations
   - Use the `ContactInfo` component for consistent display of contact information
   
4. **Event Schedule**:
   - Update the schedule in `app/config/schedule.ts` for upcoming events
   - The schedule is structured with festival days and events with detailed timing
   - For translations, update the event titles and descriptions in each language's dictionary file under `schedule.events`
   - Each event has an ID that's used to match translations in the dictionaries

## Deployment

The project is configured for easy deployment on Vercel or any other Next.js compatible hosting.

```bash
npm run build
```

Then deploy the built application to your preferred hosting provider.

Don't forget to set the required environment variables in your production environment.