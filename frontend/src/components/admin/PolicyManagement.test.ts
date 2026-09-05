import { describe, expect, it } from "vitest";

import { applyMarkdownSnippet } from "./PolicyManagement";

function makeTextarea(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.selectionStart = selectionStart;
  textarea.selectionEnd = selectionEnd;
  return textarea;
}

describe("applyMarkdownSnippet", () => {
  it("wraps the current selection with the given markers", () => {
    const textarea = makeTextarea("Hello world", 6, 11);
    expect(applyMarkdownSnippet(textarea, "**", "**", "bold text")).toBe("Hello **world**");
  });

  it("inserts a placeholder when nothing is selected", () => {
    const textarea = makeTextarea("", 0, 0);
    expect(applyMarkdownSnippet(textarea, "## ", "", "Heading")).toBe("## Heading");
  });

  it("preserves surrounding text outside the selection", () => {
    const textarea = makeTextarea("before middle after", 7, 13);
    expect(applyMarkdownSnippet(textarea, "_", "_", "x")).toBe("before _middle_ after");
  });
});
