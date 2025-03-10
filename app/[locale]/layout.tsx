import { NextIntlClientProvider } from 'next-intl';
import { ReactNode } from 'react';
import { getMessages } from 'next-intl/server';
import { FESTIVAL_CONFIG } from '@/app/config/dates';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const messages = await getMessages({ locale });
  
  return {
    title: `${messages.festivalName} ${FESTIVAL_CONFIG.year}`,
    description: messages.welcome.subtitle,
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
      {children}
    </NextIntlClientProvider>
  );
}