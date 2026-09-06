// @types/jest-axe only augments the `jest` namespace, which Vitest 5 no
// longer bridges into its own matcher types (unlike Vitest 4). Mirror the
// same `toHaveNoViolations(): R` signature @types/jest-axe declares for
// `jest.Matchers<R, T>`, on Vitest's own `Matchers<R, T>` extension point.
import "vitest";

declare module "vitest" {
  interface Matchers<R = void, T = unknown> {
    toHaveNoViolations(): R;
  }
}
