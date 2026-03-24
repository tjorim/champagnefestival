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
