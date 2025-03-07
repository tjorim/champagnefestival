import type { Metadata } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../globals.css';
import { languages, getDictionary, defaultLanguage } from '@/lib/i18n';

/**
 * Generates an array of static parameter objects for each supported language.
 *
 * This asynchronous function maps over the available languages and returns an array of objects, each containing a language code.
 * The resulting array is used by Next.js to statically generate localized routes.
 *
 * @returns An array of objects with a "lang" property for each language.
 */
export async function generateStaticParams() {
  return languages.map(lang => ({ lang }));
}

/**
 * Asynchronously generates SEO, OpenGraph, and Twitter metadata for the festival website using a localized dictionary.
 *
 * This function retrieves localization content based on the provided language code and constructs a metadata object
 * that includes the title, description, keywords, social sharing details, alternate language URLs, and robots directives.
 * The base URL is determined from an environment variable or defaults to "https://champagnefestival.com".
 *
 * @param params - An object containing the language code as `lang` for localization.
 * @returns A promise that resolves to the metadata configuration.
 */
export async function generateMetadata({ 
  params 
}: { 
  params: { lang: string }
}): Promise<Metadata> {
  // Use searchParams pattern to properly handle dynamic params
  const lang = (await params)?.lang ?? defaultLanguage;
  
  // Get the dictionary based on the language
  const dict = await getDictionary(lang);
  
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://champagnefestival.com";
  
  return {
    title: {
      default: `${dict.festivalName} 2025`,
      template: `%s | ${dict.festivalName}`
    },
    description: dict.welcome.subtitle,
    keywords: ["champagne", "festival", "wine tasting", "event", "gourmet", "luxury"],
    // Adding OpenGraph metadata for better social sharing
    openGraph: {
      title: `${dict.festivalName} 2025`,
      description: dict.welcome.subtitle,
      locale: lang,
      type: 'website',
      url: `${baseUrl}/${lang}`,
      siteName: dict.festivalName,
      images: [
        {
          url: `${baseUrl}/images/og-image.jpg`,
          width: 1200,
          height: 630,
          alt: dict.festivalName,
        }
      ],
    },
    // Twitter card
    twitter: {
      card: 'summary_large_image',
      title: `${dict.festivalName} 2025`,
      description: dict.welcome.subtitle,
      images: [`${baseUrl}/images/og-image.jpg`],
    },
    // Primary language of the page and alternates
    alternates: {
      languages: {
        'en': `${baseUrl}/en`,
        'fr': `${baseUrl}/fr`,
        'nl': `${baseUrl}/nl`,
      },
      canonical: `${baseUrl}/${lang}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
};

/**
 * Renders the root layout for the application.
 *
 * This component establishes the HTML structure by setting the document's language attribute based on the provided parameters and applying a dark Bootstrap theme. It wraps and displays the child components within a container keyed by the language.
 *
 * @param children - The components to be rendered within the layout.
 * @param params - An object containing the language code used to set the HTML element's `lang` attribute.
 */
export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { lang: string };
}) {
  // Use searchParams pattern to properly handle dynamic params
  const lang = (await params)?.lang ?? defaultLanguage;
  
  // Return only the child content wrapped in a div with language key
  // This avoids nested <html> tags since the root layout already provides the HTML structure
  return (
    <div key={lang}>
      {children}
    </div>
  );
}