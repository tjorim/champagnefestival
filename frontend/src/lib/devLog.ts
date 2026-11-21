/**
 * Development-only logging utilities. All calls are no-ops in production builds.
 */

// eslint-disable-next-line no-console
export const devError: typeof console.error = import.meta.env.DEV
  ? console.error.bind(console)
  : () => {};
