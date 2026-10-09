import { describe, expect, it } from "vitest";
import { NO_PRODUCT_TRANSLATIONS } from "@/types/event";
import { eventDescription, eventTitle, productDescription, productName } from "@/utils/eventText";
import { noEventTranslations } from "./eventFixtures";

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

describe("productName / productDescription", () => {
  const product = {
    ...NO_PRODUCT_TRANSLATIONS,
    name: "Fles",
    nameNl: "Fles",
    nameEn: "Bottle",
    description: "Goed gekoeld",
    descriptionLanguage: "nl" as const,
    descriptionNl: "Goed gekoeld",
  };

  it("shows the visitor's language and falls back to the original", () => {
    expect(productName(product, "en")).toBe("Bottle");
    expect(productName(product, "fr")).toBe("Fles");
    expect(productName({ ...product, nameEn: " " }, "en")).toBe("Fles");
    expect(productDescription(product, "en")).toBe("Goed gekoeld");
  });

  it("uses an empty description when there is none", () => {
    expect(
      productDescription(
        { ...product, description: "", descriptionLanguage: null, descriptionNl: null },
        "fr",
      ),
    ).toBe("");
  });
});
