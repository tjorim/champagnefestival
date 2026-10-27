import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@/paraglide/runtime";
import { pickTranslation } from "@/utils/translatedText";
import { useLanguage } from "./useLanguage";

function Probe() {
  useLanguage();
  return null;
}

beforeEach(() => {
  document.documentElement.lang = "nl";
});

afterEach(() => {
  setLocale("nl", { reload: false });
});

describe("useLanguage", () => {
  it.each(["nl", "fr", "en"] as const)("declares %s when it is the initial locale", (locale) => {
    setLocale(locale, { reload: false });
    document.documentElement.lang = "xx";

    render(<Probe />);

    expect(document.documentElement.lang).toBe(locale);
  });

  it("follows live language changes and stops after unmount", () => {
    const { unmount } = render(<Probe />);
    expect(document.documentElement.lang).toBe("nl");

    setLocale("fr", { reload: false });
    expect(document.documentElement.lang).toBe("fr");
    setLocale("en", { reload: false });
    expect(document.documentElement.lang).toBe("en");

    unmount();
    setLocale("nl", { reload: false });
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("pickTranslation", () => {
  const text = { nl: "Hallo", fr: "Bonjour", en: null };

  it("leaves lang unset when the interface language has its own text", () => {
    expect(pickTranslation(text, "fr")).toEqual({ text: "Bonjour", lang: undefined });
    expect(pickTranslation(text, "nl")).toEqual({ text: "Hallo", lang: undefined });
  });

  it("marks the Dutch fallback with its own language", () => {
    expect(pickTranslation(text, "en")).toEqual({ text: "Hallo", lang: "nl" });
    expect(pickTranslation({ ...text, fr: "  " }, "fr")).toEqual({ text: "Hallo", lang: "nl" });
  });

  it("returns null without any text", () => {
    expect(pickTranslation({ nl: " ", fr: null, en: null }, "en")).toBeNull();
  });
});
