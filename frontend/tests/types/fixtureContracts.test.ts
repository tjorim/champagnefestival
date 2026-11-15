import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseSync, Visitor } from "oxc-parser";
import { expect, it } from "vitest";

it("keeps test-local MSW responses checked or explicitly exceptional", () => {
  const unchecked: string[] = [];
  for (const directory of ["src", "tests", "e2e"]) {
    for (const entry of readdirSync(resolve(directory), { recursive: true })) {
      const file = resolve(directory, String(entry));
      if (!/\.(?:test|spec)\.tsx?$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      const parsed = parseSync(file, source);
      new Visitor({
        CallExpression(node) {
          const callee = source.slice(node.callee.start, node.callee.end);
          if (!["HttpResponse.json", "jsonResponse"].includes(callee)) return;
          if (callee === "jsonResponse" && !source.includes('from "@/mocks/response"')) return;
          if (node.typeArguments) return;
          const response = source.slice(node.start, node.end);
          // Exceptions must explain the specific error, malformed input or unreachable sentinel.
          if (/\/\* (?:Fixture exception:|Deliberately malformed)[\s\S]+?\*\//.test(response))
            return;
          unchecked.push(`${file}:${source.slice(0, node.start).split("\n").length}`);
        },
      }).visit(parsed.program);
    }
  }
  expect(unchecked).toEqual([]);
});
