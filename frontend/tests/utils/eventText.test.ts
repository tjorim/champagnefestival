import { describe, expect, it, vi } from "vitest";
import { eventCategoryLabel, eventDescription, eventTitle } from "@/utils/eventText";
import { noEventTranslations } from "./eventFixtures";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, () => string>, {
    get: (_target, key: string) => () => key,
  }),
}));

const event = {
  ...noEventTranslations,
  title: "Openingsavond",
  titleNl: "Openingsavond",
  titleEn: "Opening night",
  description: "Een glas om te starten",
  descriptionLanguage: "nl" as const,
  descriptionNl: "Een glas om te starten",
};

describe("eventTitle / eventDescription", () => {
  it("shows the visitor's language when it has text", () => {
    expect(eventTitle(event, "en")).toBe("Opening night");
    expect(eventTitle(event, "nl")).toBe("Openingsavond");
  });

  it("falls back to the original language for a missing or blank translation", () => {
    expect(eventTitle(event, "fr")).toBe("Openingsavond");
    expect(eventTitle({ ...event, titleEn: "   " }, "en")).toBe("Openingsavond");
    expect(eventTitle(event, "de")).toBe("Openingsavond");
    expect(eventDescription(event, "en")).toBe("Een glas om te starten");
  });

  it("uses the original language of the field, not the locale's neighbour", () => {
    const french = {
      ...noEventTranslations,
      title: "Dégustation",
      titleLanguage: "fr" as const,
      titleFr: "Dégustation",
      description: "",
    };
    expect(eventTitle(french, "nl")).toBe("Dégustation");
    expect(eventDescription(french, "nl")).toBe("");
  });

  it("shows only the original when nothing is translated, in every locale", () => {
    const plain = { ...noEventTranslations, title: "Brunch", titleNl: "Brunch", description: "" };
    for (const locale of ["nl", "fr", "en"]) expect(eventTitle(plain, locale)).toBe("Brunch");
  });
});

describe("eventCategoryLabel", () => {
  it("labels every category in the fixed list and keeps an unknown value as stored", () => {
    for (const category of [
      "tasting",
      "vip",
      "party",
      "breakfast",
      "exchange",
      "general",
      "ceremony",
      "social",
      "other",
    ]) {
      expect(eventCategoryLabel(category)).toBe(`schedule_categories_${category}`);
    }
    expect(eventCategoryLabel("legacy")).toBe("legacy");
  });
});
