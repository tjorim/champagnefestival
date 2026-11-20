import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseSync, Visitor } from "oxc-parser";
import { expect, it } from "vitest";

const exception = (text: string) =>
  /\/\* (?:Fixture exception:|Deliberately malformed)[\s\S]+?\*\//.test(text);

/**
 * Lines of successful-response fixtures that are neither checked against a generated type nor
 * explained by a `/* Fixture exception: <reason> *\/` comment inside the call.
 *
 * Checked means: `jsonResponse<Type>(...)` / `HttpResponse.json<Type>(...)` with an explicit,
 * non-erased type argument, or a Playwright `route.fulfill({ json: <value> satisfies Type })`.
 */
export function uncheckedFixtures(file: string, source: string): number[] {
  const unchecked: number[] = [];
  const fail = (start: number) => unchecked.push(source.slice(0, start).split("\n").length);
  new Visitor({
    CallExpression(node) {
      const callee = source.slice(node.callee.start, node.callee.end);
      const text = source.slice(node.callee.end, node.end);
      if (exception(text)) return;
      if (["HttpResponse.json", "jsonResponse"].includes(callee)) {
        if (callee === "jsonResponse" && !source.includes('from "@/mocks/response"')) return;
        if (!node.typeArguments) return fail(node.start);
        const types = source.slice(node.typeArguments.start, node.typeArguments.end);
        if (/\b(?:any|unknown)\b/.test(types) || /as (?:never|unknown)/.test(text))
          fail(node.start);
      }
      if (callee.endsWith(".fulfill")) {
        const options = node.arguments[0];
        if (options?.type !== "ObjectExpression") return;
        const json = options.properties.find(
          (prop) =>
            prop.type === "Property" && prop.key.type === "Identifier" && prop.key.name === "json",
        );
        if (json?.type !== "Property") return;
        let value = json.value;
        while (value.type === "ParenthesizedExpression") value = value.expression;
        if (value.type !== "TSSatisfiesExpression") fail(node.start);
      }
    },
  }).visit(parseSync(file, source).program);
  return unchecked;
}

it("keeps test-local MSW and browser success responses checked or explicitly exceptional", () => {
  const unchecked: string[] = [];
  for (const directory of ["src", "tests", "e2e"]) {
    for (const entry of readdirSync(resolve(directory), { recursive: true })) {
      const file = resolve(directory, String(entry));
      if (!/\.(?:test|spec)\.tsx?$/.test(file)) continue;
      if (file.endsWith("/fixtureContracts.test.ts")) continue;
      for (const line of uncheckedFixtures(file, readFileSync(file, "utf8")))
        unchecked.push(`${file}:${line}`);
    }
  }
  expect(unchecked).toEqual([]);
});

it("rejects inferred or erased success fixtures while allowing explicit schema checks and reasoned exceptions", () => {
  expect(
    uncheckedFixtures(
      "fixture.ts",
      `
    HttpResponse.json({ renamed: true });
    HttpResponse.json<unknown>({ renamed: true });
    route.fulfill({ json: { renamed: true } });
    HttpResponse.json<OrganizationOut>(record as never);
  `,
    ),
  ).toHaveLength(4);
  expect(
    uncheckedFixtures(
      "fixture.ts",
      `
    HttpResponse.json<OrganizationOut>(organization);
    route.fulfill({ json: organization satisfies OrganizationOut });
    HttpResponse.json(/* Fixture exception: Malformed success tests the compatibility fallback. */ {});
  `,
    ),
  ).toEqual([]);
});
