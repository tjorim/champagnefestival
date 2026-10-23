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
    expect(organizationDescription(item, "en")).toBe("Hello");
    expect(organizationDescription(item, "fr")).toBe("Bonjour");
  });
  it("falls back to Dutch, including for blank translations and unsupported locales", () => {
    expect(organizationDescription(item, "nl")).toBe("Hallo");
    expect(organizationDescription({ ...item, description_en: " " }, "en")).toBe("Hallo");
    expect(organizationDescription(item, "de")).toBe("Hallo");
  });
  it("omits descriptions when absent", () => {
    expect(organizationDescription({ id: 2, name: "Empty", image: "" }, "en")).toBeNull();
  });
});
