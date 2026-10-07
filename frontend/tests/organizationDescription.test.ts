import { describe, expect, it } from "vitest";
import { organizationDescription } from "@/utils/organizationDescription";

describe("organization descriptions", () => {
  const item = {
    id: 1,
    name: "Maison",
    image: "",
    description_language: "fr" as const,
    description_fr: "Bonjour",
    description_en: "Hello",
  };
  it("uses the visitor language before the original", () => {
    expect(organizationDescription(item, "en")).toBe("Hello");
    expect(organizationDescription(item, "fr")).toBe("Bonjour");
  });
  it("falls back to the original, including for blank translations and unsupported locales", () => {
    expect(organizationDescription(item, "nl")).toBe("Bonjour");
    expect(organizationDescription({ ...item, description_en: " " }, "en")).toBe("Bonjour");
    expect(organizationDescription(item, "de")).toBe("Bonjour");
  });
  it("omits descriptions when absent", () => {
    expect(organizationDescription({ id: 2, name: "Empty", image: "" }, "en")).toBeNull();
  });
});
