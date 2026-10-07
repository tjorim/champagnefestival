import { describe, expect, it } from "vitest";
import { exhibitorDescription } from "@/utils/exhibitorDescription";

describe("exhibitor descriptions", () => {
  const item = {
    id: 1,
    name: "Maison",
    image: "",
    description_language: "fr" as const,
    description_fr: "Bonjour",
    description_en: "Hello",
  };
  it("uses the visitor language before the original", () => {
    expect(exhibitorDescription(item, "en")).toBe("Hello");
    expect(exhibitorDescription(item, "fr")).toBe("Bonjour");
  });
  it("falls back to the original, including for blank translations and unsupported locales", () => {
    expect(exhibitorDescription(item, "nl")).toBe("Bonjour");
    expect(exhibitorDescription({ ...item, description_en: " " }, "en")).toBe("Bonjour");
    expect(exhibitorDescription(item, "de")).toBe("Bonjour");
  });
  it("omits descriptions when absent", () => {
    expect(exhibitorDescription({ id: 2, name: "Empty", image: "" }, "en")).toBeNull();
  });
});
