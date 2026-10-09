import { describe, expect, it } from "vitest";
import { generateGoogleMapsUrl } from "@/utils/maps";

describe("generateGoogleMapsUrl", () => {
  it("builds an encoded search query from the venue parts", () => {
    expect(
      generateGoogleMapsUrl("Brussels Expo", "Place de Belgique 1", "1020", "Brussels", "Belgium"),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=Brussels%20Expo%2C%20Place%20de%20Belgique%201%2C%201020%2C%20Brussels%2C%20Belgium",
    );
  });

  it("returns null when there is nothing to search for", () => {
    expect(generateGoogleMapsUrl("", "", "", "", "")).toBeNull();
  });
});
