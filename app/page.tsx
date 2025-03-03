import { redirect } from 'next/navigation';
import { defaultLanguage } from '@/lib/i18n';

// Root page just redirects to the default language
export default function Home() {
  redirect(`/${defaultLanguage}`);
}