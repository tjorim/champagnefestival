import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Specify the path to the internationalization configuration
const withNextIntl = createNextIntlPlugin('./app/i18n.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Enable Cloudflare Pages compatibility
  // Remove standalone output for Cloudflare Pages compatibility

  // Copy routing files to the output directory
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/:path*',
      },
      {
        source: '/',
        destination: '/nl',
      }
    ];
  },

  // Ensure these files are copied to output
  async headers() {
    return [];
  }
};

export default withNextIntl(nextConfig);