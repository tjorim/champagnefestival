import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { defaultLanguage, languages } from '@/lib/i18n';
import { festivalYear } from '@/app/config/dates';
import { baseUrl } from '@/app/config/site';

// Let's try without edge runtime declaration

const inter = Inter({ subsets: ['latin'] });

// Base metadata that will be extended by locale-specific metadata
export const metadata: Metadata = {
  // Minimal fallback values that should rarely be seen by users
  // Real metadata is generated in [locale]/layout.tsx
  title: {
    template: '%s | Champagne Festival',
    default: `Champagne Festival ${festivalYear}`,
  },
  description: "Champagne Festival",
  // Define available languages for better SEO
  alternates: {
    languages: {
      'x-default': '/',
      ...Object.fromEntries(languages.map(lang => [lang, `/${lang}`]))
    }
  }
};

/**
 * Renders the root layout for the application.
 *
 * This component establishes the overall HTML structure by setting the document language to the default language
 * and applying a dark Bootstrap theme along with global Inter font styling. It wraps and displays the provided 
 * children within the body element.
 *
 * @param children - The content to be rendered inside the layout.
 *
 * @returns A JSX element representing the complete HTML structure for the application.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={defaultLanguage} data-bs-theme="dark" style={{transitionProperty: "none", marginRight: "0px"}}>
      <head>
        {/* Alternate language links for SEO */}
        {languages.map(lang => (
          <link 
            key={lang} 
            rel="alternate" 
            hrefLang={lang} 
            href={`${baseUrl}/${lang}`} 
          />
        ))}
        <link rel="alternate" hrefLang="x-default" href={baseUrl} />
      </head>
      <body className={`${inter.className} rounded-avatar`}>
        {children}
      </body>
    </html>
  );
}