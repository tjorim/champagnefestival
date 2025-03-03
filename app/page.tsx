import { redirect } from 'next/navigation';
import { defaultLanguage } from '@/get-dictionary';

// Root page just redirects to the default language
export default function Home() {
  redirect(`/${defaultLanguage}`);
}