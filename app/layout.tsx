import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// Generate standard metadata for non-localized routes
export const metadata: Metadata = {
  title: 'Champagne Festival',
  description: 'Annual Champagne Festival',
};

/**
 * Renders the root layout for the application.
 *
 * This component establishes the overall HTML structure by setting the document language to English and applying a dark Bootstrap theme along with global Inter font styling. It wraps and displays the provided children within the body element.
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
    <html lang="en" data-bs-theme="dark" style={{transitionProperty: "none", marginRight: "0px"}}>
      <body className={`${inter.className} rounded-avatar`}>
        {children}
      </body>
    </html>
  );
}