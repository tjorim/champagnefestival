import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../globals.css';
import { languages, getDictionary } from '@/lib/i18n';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return languages.map(lang => ({ lang }));
}

export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
  // Get the dictionary based on the language
  const dict = await getDictionary(params.lang);
  
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
      locale: params.lang,
      type: 'website',
      url: `${baseUrl}/${params.lang}`,
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
      canonical: `${baseUrl}/${params.lang}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
};

export default function RootLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { lang: string };
}) {
  return (
    <html lang={params.lang} data-bs-theme="dark">
      <body className={inter.className}>
        <div key={params.lang}>
          {children}
        </div>
      </body>
    </html>
  );
}