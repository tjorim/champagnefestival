import { describe, expect, it } from "vitest";
import { categoryLabel } from "@/hooks/useCategories";
import { apiToCategory } from "@/types/category";

const categories = [
  apiToCategory({
    key: "tasting",
    label: "Degustatie",
    label_nl: "Degustatie",
    label_fr: "Dégustation",
    label_en: null,
    sort_order: 10,
  }),
  apiToCategory({
    key: "gala",
    label: "Gala",
    label_nl: "Gala",
    label_en: "Gala",
    sort_order: 20,
  }),
];

describe("apiToCategory", () => {
  it("maps the stored labels, defaulting the order", () => {
    expect(categories[0]).toMatchObject({ key: "tasting", labelFr: "Dégustation", labelEn: null });
    expect(apiToCategory({ key: "x" })).toMatchObject({ labelNl: null, sortOrder: 0 });
  });
});

describe("categoryLabel", () => {
  it("shows the visitor's language when the label has text", () => {
    expect(categoryLabel(categories, "tasting", "fr")).toBe("Dégustation");
  });

  it("falls back to Dutch", () => {
    expect(categoryLabel(categories, "tasting", "en")).toBe("Degustatie");
    expect(categoryLabel(categories, "gala", "nl")).toBe("Gala");
    expect(categoryLabel(categories, "tasting", "de")).toBe("Degustatie");
  });

  it("is null while loading or for an unknown key, so no raw key is shown", () => {
    expect(categoryLabel(undefined, "tasting", "nl")).toBeNull();
    expect(categoryLabel(categories, "missing", "nl")).toBeNull();
  });
});
