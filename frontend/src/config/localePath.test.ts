import { expect, it } from "vitest";
import { localizedPublicPath, localizedPublicUrl, pathLocale } from "./localePath";

it("recognises only explicit public locale paths", () => {
  expect(pathLocale("/en")).toBe("en");
  expect(pathLocale("/fr/privacy")).toBe("fr");
  for (const path of ["/", "/privacy", "/admin", "/en/admin"])
    expect(pathLocale(path)).toBeUndefined();
});
it("switches public paths and leaves staff routes alone", () => {
  expect(localizedPublicPath("/fr", "en")).toBe("/en");
  expect(localizedPublicPath("/en/privacy", "nl")).toBe("/privacy");
  expect(localizedPublicPath("/privacy", "fr")).toBe("/fr/privacy");
  expect(localizedPublicPath("/admin", "fr")).toBe("/admin");
});

it("preserves the hash and query when constructing a language switch", () => {
  expect(localizedPublicUrl("https://example.com/fr/privacy?x=1#policy", "en").href).toBe(
    "https://example.com/en/privacy?x=1#policy",
  );
});
