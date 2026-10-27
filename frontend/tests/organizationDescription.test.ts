import { describe, expect, it } from "vitest";
import { organizationDescription } from "@/utils/organizationDescription";

describe("organization descriptions", () => {
  const item = {
    id: 1,
    name: "Maison",
    image: "",
    description_nl: "Hallo",
    description_fr: "Bonjour",
    description_en: "Hello",
  };
  it("uses the visitor language before Dutch", () => {
    expect(organizationDescription(item, "en")).toEqual({ text: "Hello", lang: undefined });
    expect(organizationDescription(item, "fr")).toEqual({ text: "Bonjour", lang: undefined });
  });
  it("falls back to Dutch, including for blank translations and unsupported locales", () => {
    expect(organizationDescription(item, "nl")).toEqual({ text: "Hallo", lang: undefined });
    expect(organizationDescription({ ...item, description_en: " " }, "en")).toEqual({
      text: "Hallo",
      lang: "nl",
    });
    expect(organizationDescription(item, "de")).toEqual({ text: "Hallo", lang: "nl" });
  });
  it("omits descriptions when absent", () => {
    expect(organizationDescription({ id: 2, name: "Empty", image: "" }, "en")).toBeNull();
  });
});
