// @types/jest-axe only augments the global `jest.Matchers<R, T>` namespace,
// which Vitest 5 no longer bridges into its own matcher types (unlike
// Vitest 4). Reuse that declaration on Vitest's own `Matchers<R, T>`
// extension point rather than retyping `toHaveNoViolations` by hand.
import "vitest";

declare module "vitest" {
  interface Matchers<R = void, T = unknown> extends jest.Matchers<R, T> {}
}
