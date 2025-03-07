import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Remove i18n config as we're using App Router's built-in i18n
  images: {
    domains: [],
  },
};

export default nextConfig;