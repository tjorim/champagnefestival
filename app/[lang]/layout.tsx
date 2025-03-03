import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../globals.css';
import { languages } from '@/get-dictionary';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return languages.map(lang => ({ lang }));
}

export const metadata: Metadata = {
  title: 'Champagne Festival',
  description: 'Annual Champagne Festival',
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
        {children}
      </body>
    </html>
  );
}