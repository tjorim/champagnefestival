import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/config/localePath";
import { getLocale, setLocale } from "@/paraglide/runtime";

describe("public locale paths", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("opens the site in the requested language, over a saved choice", () => {
    window.localStorage.setItem("PARAGLIDE_LOCALE", "en");
    window.history.replaceState(null, "", "/fr");

    expect(getLocale()).toBe("fr");
  });

  it("ignores an unknown language and falls back to the saved choice", () => {
    window.localStorage.setItem("PARAGLIDE_LOCALE", "en");
    window.history.replaceState(null, "", "/?lng=de");

    expect(getLocale()).toBe("en");
  });

  it("persists a choice without rewriting the current document URL", () => {
    setLocale("fr", { reload: false });
    expect(window.location.pathname).toBe("/");
    expect(getLocale()).toBe("fr");
  });
});
