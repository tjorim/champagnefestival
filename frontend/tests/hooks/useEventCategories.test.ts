import { describe, expect, it } from "vitest";
import { eventCategoryLabel } from "@/hooks/useEventCategories";
import { apiToEventCategory } from "@/types/eventCategory";

const categories = [
  apiToEventCategory({
    key: "tasting",
    label: "Degustatie",
    label_language: "nl",
    label_nl: "Degustatie",
    label_fr: "Dégustation",
    label_en: null,
    sort_order: 10,
  }),
  apiToEventCategory({
    key: "gala",
    label: "Gala",
    label_language: "en",
    label_en: "Gala",
    sort_order: 20,
  }),
];

describe("apiToEventCategory", () => {
  it("maps the stored labels, defaulting the language and order", () => {
    expect(categories[0]).toMatchObject({ key: "tasting", labelFr: "Dégustation", labelEn: null });
    expect(apiToEventCategory({ key: "x" })).toMatchObject({ labelLanguage: "nl", sortOrder: 0 });
  });
});

describe("eventCategoryLabel", () => {
  it("shows the visitor's language when the label has text", () => {
    expect(eventCategoryLabel(categories, "tasting", "fr")).toBe("Dégustation");
  });

  it("falls back to the original language", () => {
    expect(eventCategoryLabel(categories, "tasting", "en")).toBe("Degustatie");
    expect(eventCategoryLabel(categories, "gala", "nl")).toBe("Gala");
    expect(eventCategoryLabel(categories, "tasting", "de")).toBe("Degustatie");
  });

  it("is null while loading or for an unknown key, so no raw key is shown", () => {
    expect(eventCategoryLabel(undefined, "tasting", "nl")).toBeNull();
    expect(eventCategoryLabel(categories, "missing", "nl")).toBeNull();
  });
});
