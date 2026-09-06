// @types/jest-axe only augments the `jest` namespace, which Vitest 5 no
// longer bridges into its own `Assertion` type (unlike Vitest 4). Mirror
// what @testing-library/jest-dom/vitest does for its own matchers.
import "vitest";
import type { IToHaveNoViolations } from "jest-axe";

declare module "vitest" {
  interface Assertion<T = any> {
    toHaveNoViolations: IToHaveNoViolations;
  }
}
