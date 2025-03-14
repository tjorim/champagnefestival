import { NextIntlClientProvider } from 'next-intl';
import { ReactNode } from 'react';
import { getMessages } from 'next-intl/server';
import { festivalYear } from '@/app/config/dates';
import { languages } from '@/lib/i18n';
import { Metadata } from 'next';
import { baseUrl, siteConfig } from '@/app/config/site';
import EventStructuredData from '@/app/components/JsonLd';

// Enable Edge Runtime for Cloudflare Pages
export const runtime = 'edge';


/**
 * Generates metadata for each locale-specific route
 * This is the primary place for SEO metadata as it includes translations
 */
export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const messages = await getMessages({ locale });

  // For TypeScript, we need to access nested properties more carefully
  const welcomeSection = messages.welcome as Record<string, string>;
  // Use more specific type for SEO section
  const seoSection = messages.seo as Record<string, string | string[]>;
  
  // Generate alternate language URLs for SEO
  const alternateLanguages: Record<string, string> = {};
  languages.forEach(lang => {
    alternateLanguages[lang] = `${baseUrl}/${lang}`;
  });
  
  return {
    title: {
      default: `${messages.festivalName} ${festivalYear}`,
      template: `%s | ${messages.festivalName}`
    },
    description: welcomeSection.subtitle,
    keywords: Array.isArray(seoSection?.keywords) 
      ? seoSection.keywords 
      : ["champagne", "festival", "wine tasting", "event", "gourmet", "luxury"],
    
    // Basic metadata for search engines
    applicationName: messages.festivalName as string,
    authors: [{ name: siteConfig.organization }],
    generator: 'Next.js',
    
    // Adding OpenGraph metadata for better social sharing (Facebook, LinkedIn, etc.)
    openGraph: {
      title: `${messages.festivalName} ${festivalYear}`,
      description: welcomeSection.subtitle,
      locale: locale,
      type: 'website',
      url: `${baseUrl}/${locale}`,
      siteName: messages.festivalName as string,
      images: [
        {
          url: `${baseUrl}/images/og-image.jpg`,
          width: 1200,
          height: 630,
          alt: messages.festivalName as string,
        }
      ],
    },
    
    // Twitter card
    twitter: {
      card: 'summary_large_image',
      title: `${messages.festivalName} ${festivalYear}`,
      description: welcomeSection.subtitle,
      images: [`${baseUrl}/images/og-image.jpg`],
      creator: siteConfig.social.twitter,
    },
    
    // Facebook-specific metadata
    other: {
      'fb:app_id': siteConfig.social.facebook.appId,
      'og:locale:alternate': languages.filter(lang => lang !== locale).map(lang => lang),
    },
    
    // Primary language of the page and alternates
    alternates: {
      languages: alternateLanguages,
      canonical: `${baseUrl}/${locale}`,
    },
    
    // Robots and crawlers
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    
    // Verification tags for webmaster tools
    verification: {
      google: siteConfig.verification.google,
    },
  };
}

export default async function LocaleLayout({
  children,
  params: { locale }
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* Add EventStructuredData component for better schema.org SEO */}
      <EventStructuredData locale={locale} />
      
      {/* Script to update the HTML lang attribute */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Wait for document to be ready
            document.addEventListener('DOMContentLoaded', function() {
              document.documentElement.lang = "${locale}";
            });
            // Also set it immediately for SSR
            if (document.documentElement) {
              document.documentElement.lang = "${locale}";
            }
          `
        }}
      />
      
      {children}
    </NextIntlClientProvider>
  );
}