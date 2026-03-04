/** Responsive breakpoints in pixels */
export const BREAKPOINTS = { xs: 320, sm: 576, md: 768, lg: 1024 } as const;

/** Debounce delay for window resize events (ms) */
export const RESIZE_DEBOUNCE_MS = 200;

/** Minimum scroll distance before showing back-to-top / updating active section (px) */
export const SCROLL_THRESHOLD_PX = 100;

/** Throttle interval for scroll event handler (ms) */
export const SCROLL_THROTTLE_MS = 100;

/** Delay before disconnecting the resize observer used during initial hash navigation (ms) */
export const ACTIVE_SECTION_CLEANUP_DELAY_MS = 2000;

/** Swiper carousel transition speed (ms) */
export const CAROUSEL_SPEED_MS = 2000;

/** Swiper carousel autoplay delay (ms) */
export const CAROUSEL_AUTOPLAY_DELAY_MS = 3000;
