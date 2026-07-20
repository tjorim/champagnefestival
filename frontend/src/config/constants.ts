/** Responsive breakpoints in pixels */
export const BREAKPOINTS = { xs: 320, sm: 576, md: 768, lg: 1024 } as const;

/** Debounce delay for window resize events (ms) */
export const RESIZE_DEBOUNCE_MS = 200;

/** Swiper carousel transition speed (ms) */
export const CAROUSEL_SPEED_MS = 2000;

/** Swiper carousel autoplay delay (ms) */
export const CAROUSEL_AUTOPLAY_DELAY_MS = 3000;

/**
 * RFC 5321-inspired email regex. Matches the most common valid email addresses
 * and rejects obvious invalid ones. Used consistently across all form components.
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Canonical contract for community edition contact emails, shared with the
 * backend's COMMUNITY_CONTACT_EMAIL_PATTERN (backend/app/schemas.py). ASCII-only
 * RFC 5321 "dot-atom" local part plus a conventional domain — a superset of
 * EMAIL_REGEX's character set that still excludes control/whitespace characters,
 * so a matching value is always safe to render as a `mailto:` link. Keep both
 * patterns in sync.
 */
export const COMMUNITY_CONTACT_EMAIL_REGEX =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
