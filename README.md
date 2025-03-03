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

## Deployment

The project is configured for easy deployment on Vercel or any other Next.js compatible hosting.

```bash
npm run build
```

Then deploy the built application to your preferred hosting provider.