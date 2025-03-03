import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  i18n: {
    locales: ['en', 'fr', 'nl'],
    defaultLocale: 'en',
  },
  images: {
    domains: [],
  },
};

export default nextConfig;