import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { defaultLanguage } from '@/lib/i18n';
import { FESTIVAL_CONFIG } from '@/app/config/dates';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: `Champagne Festival ${FESTIVAL_CONFIG.year}`,
  description: "Join us for the most exquisite champagne tasting experience",
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
      <body className={`${inter.className} rounded-avatar`}>
        {children}
      </body>
    </html>
  );
}