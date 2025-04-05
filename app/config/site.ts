/**
 * Site-wide configuration for the Champagne Festival application
 */

// Base URL of the site
// First try CF_PAGES_URL (automatically set by Cloudflare), then NEXT_PUBLIC_BASE_URL, then fallback
export const baseUrl = 
  (typeof process !== 'undefined' && process?.env?.CF_PAGES_URL) || 
  (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_BASE_URL) || 
  "https://www.champagnefestival.be";

// Site name and organization
export const siteConfig = {
  name: "Champagne Festival",
  organization: "Champagne Festival Organization",
  
  // Social media handles
  social: {
    twitter: "@ChampagneFest",
    facebook: {
      appId: (typeof process !== 'undefined' && process?.env?.FACEBOOK_APP_ID) || ""
    }
  },
  
  // SEO verification codes
  verification: {
    google: (typeof process !== 'undefined' && process?.env?.GOOGLE_SITE_VERIFICATION) || ""
  }
};

/**
 * Returns the full URL for a given path
 * 
 * @param path - The path to append to the base URL
 * @returns The full URL
 */
export function getFullUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Handle trailing slash in baseUrl
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  
  return `${base}${cleanPath}`;
}