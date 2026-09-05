/**
 * Site-wide configuration
 */

// Base URL for the site, used for SEO and social sharing. Shares its source of
// truth with index.html's %VITE_PUBLIC_URL% substitution and the generated
// robots.txt/sitemap.xml (see scripts/generate-seo-files.mjs) instead of a
// separately hardcoded domain that can drift from the deployed host.
export const baseUrl = import.meta.env.VITE_PUBLIC_URL;

// Site metadata
export const siteMetadata = {
  title: "Champagnefestival",
  description:
    "Annual champagnefestival featuring tastings, masterclasses, and gourmet food pairings",
  author: "Champagnefestival Team",
  themeColor: "#1a1a1a",
  locale: "nl",
  locales: ["nl", "en", "fr"],
};
