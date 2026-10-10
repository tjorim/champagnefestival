import { expect, it } from "vitest";
import { sourceCandidates, frozenMessageCalls } from "./locale-audit.mjs";

it("finds JSX copy, single-word labels, validators, enum prose and template fragments", () => {
  const source = `const labels = { wait: "Even wachten" }; const validate = () => "Geef een naam";
    const text = \`Nog \${count} dagen\`; const view = <><p>Welkom</p><p>{"Hallo"}</p><input aria-label="Naam" placeholder="Zoeken" className="grid gap-2" /></>;`;
  expect(sourceCandidates(source).map((item) => item.text)).toEqual([
    "Even wachten",
    "Geef een naam",
    "Nog",
    "dagen",
    "Welkom",
    "Hallo",
    "Naam",
    "Zoeken",
  ]);
  expect(sourceCandidates('const labels = { title: "Welkom" };').map((item) => item.text)).toEqual([
    "Welkom",
  ]);
  expect(sourceCandidates('const serverFields = { title: "title" };')).toEqual([]);
  expect(sourceCandidates('const config = { serverFields: { label: "label" } };')).toEqual([]);
  expect(sourceCandidates('const id = "protocol-key";', "source.ts", true)[0].text).toBe(
    "protocol-key",
  );
});

it("ignores diagnostics, directives, colours, media queries and class lists", () => {
  const source = `"use client"; console.warn("Could not load"); logger.error(\`Failed to save: \${id}\`, error);
    const dark = matchMedia("(prefers-color-scheme: dark)"); const fill = "rgba(168, 85, 247, 0.7)";
    const box = <i className="[&_svg:not([class*='size-'])]:size-4 data-[size=sm]/dialog:grid" />;`;
  expect(sourceCandidates(source)).toEqual([]);
  expect(
    sourceCandidates(
      'const base = cva("uppercase tracking wide", { variants: { size: { sm: "text xs" } } });',
    ),
  ).toEqual([]);
  expect(sourceCandidates("throw new RangeError(`Invalid value: ${value}`);")).toEqual([]);
  expect(sourceCandidates('toast.error("Could not load");').map((item) => item.text)).toEqual([
    "Could not load",
  ]);
});

it("rejects module-level translations while allowing deferred functions and getters", () => {
  expect(frozenMessageCalls("const copy = m.settings();")).toEqual([1]);
  expect(frozenMessageCalls("const labels = { title: m.settings() };")).toEqual([1]);
  expect(
    frozenMessageCalls(
      "const labels = { get title() { return m.settings(); } }; const notice = () => m.settings();",
    ),
  ).toEqual([]);
});
