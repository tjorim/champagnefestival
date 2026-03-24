/** Shared validation helpers used across all forms. */

/**
 * RFC 5321-inspired email regex. Matches the most common valid email addresses
 * and rejects obvious invalid ones. Used consistently across all form components.
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
