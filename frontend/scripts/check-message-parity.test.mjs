import { expect, it } from "vitest";
import { catalogueErrors } from "./check-message-parity.mjs";

it("rejects missing keys and inputs, including declaration-only plural inputs", () => {
  expect(catalogueErrors({ greeting: "Hello {name}" }, {})).toHaveLength(1);
  expect(
    catalogueErrors({ greeting: "Hello {name}" }, { greeting: "Hallo {person}" }),
  ).toHaveLength(1);
  const plural = (input = "count", match = "countPlural=other") => [
    {
      declarations: [`input ${input}`, "local countPlural = count: plural"],
      selectors: ["countPlural"],
      match: { [match]: "{count} records" },
    },
  ];
  expect(catalogueErrors({ count: plural() }, { count: plural("total") })).toHaveLength(1);
  expect(
    catalogueErrors({ count: plural() }, { count: plural("count", "countPlural=one") }),
  ).toHaveLength(1);
  expect(catalogueErrors({ greeting: "Hello {name}" }, { greeting: "{name}, hallo" })).toEqual([]);
});
