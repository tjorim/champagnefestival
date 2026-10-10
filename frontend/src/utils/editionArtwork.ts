/** Helpers for the admin-uploaded edition artwork (#1224). */

/** Where the backend stores managed edition images; anything else is not trusted as artwork. */
const MANAGED_PREFIX = "/uploads/editions/";
const MANAGED_NAME = /^[a-f0-9]{32}-[a-f0-9]{64}\.jpg$/;

/** The static images the site falls back to while a slot is empty. */
export const DEFAULT_FLYER = "/images/flyer.jpg";
export const DEFAULT_HERO = "/images/champagne-hero.png";
export const DEFAULT_SHARE = "/images/og-image.jpg";

/** The path when it is a managed upload, else `null` (so a bad value can never reach CSS or an `<img>`). */
export function managedArtwork(path: string | null | undefined): string | null {
  return typeof path === "string" &&
    path.startsWith(MANAGED_PREFIX) &&
    MANAGED_NAME.test(path.slice(MANAGED_PREFIX.length))
    ? path
    : null;
}

/** Mirrors the backend: the sharing image, else the hero photo, else `null` (keep the static default). */
export function editionShareImage(edition: {
  shareImage?: string | null;
  heroImage?: string | null;
}): string | null {
  return managedArtwork(edition.shareImage) ?? managedArtwork(edition.heroImage);
}
