import { describe, expect, it, vi } from "vitest";

import { createOidcConfig } from "../../src/config/oidc";

type SigninUser = Parameters<
  NonNullable<ReturnType<typeof createOidcConfig>["onSigninCallback"]>
>[0];

describe("createOidcConfig", () => {
  it("navigates through the app router to the OIDC return path", () => {
    const navigateTo = vi.fn();
    const config = createOidcConfig({ navigateTo });

    config.onSigninCallback?.({ state: { returnTo: "/check-in?id=abc" } } as SigninUser);

    expect(navigateTo).toHaveBeenCalledWith("/check-in?id=abc");
  });

  it("defaults post-sign-in navigation to the admin route", () => {
    const navigateTo = vi.fn();
    const config = createOidcConfig({ navigateTo });

    config.onSigninCallback?.(undefined as unknown as SigninUser);

    expect(navigateTo).toHaveBeenCalledWith("/admin");
  });
});
