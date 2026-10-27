import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/config/localeQuery";
import { getLocale, setLocale } from "@/paraglide/runtime";

describe("the lng query parameter", () => {
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
    window.history.replaceState(null, "", "/?lng=fr");

    expect(getLocale()).toBe("fr");
  });

  it("ignores an unknown language and falls back to the saved choice", () => {
    window.localStorage.setItem("PARAGLIDE_LOCALE", "en");
    window.history.replaceState(null, "", "/?lng=de");

    expect(getLocale()).toBe("en");
  });

  it("keeps an explicit parameter in step with a language switch", () => {
    window.history.replaceState(null, "", "/?lng=fr&x=1#faq");

    setLocale("en", { reload: false });

    expect(window.location.search).toBe("?lng=en&x=1");
    expect(window.location.hash).toBe("#faq");
    expect(getLocale()).toBe("en");
  });

  it("leaves a page opened without the parameter alone", () => {
    setLocale("fr", { reload: false });

    expect(window.location.search).toBe("");
    expect(getLocale()).toBe("fr");
  });
});
