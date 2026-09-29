import type { Page } from "@playwright/test";

export async function legacyStyleChanges(page: Page) {
  return page.evaluate(() => {
    const sheet = [...document.styleSheets].find(
      (candidate) =>
        candidate.ownerNode instanceof HTMLElement &&
        candidate.ownerNode.dataset.viteDevId?.endsWith("/src/styles/tailwind.css"),
    );
    if (!sheet) throw new Error("Tailwind stylesheet missing");
    const elements = [...document.querySelectorAll("*")];
    const properties = [
      "display",
      "position",
      "padding",
      "margin",
      "border",
      "color",
      "backgroundColor",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "boxSizing",
      "gap",
      "borderRadius",
    ] as const;
    const read = () =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return properties.map((property) => style[property]);
      });
    const enabled = read();
    sheet.disabled = true;
    const disabled = read();
    sheet.disabled = false;
    return elements.flatMap((element, index) =>
      JSON.stringify(enabled[index]) === JSON.stringify(disabled[index])
        ? []
        : [element.tagName + "." + element.className],
    );
  });
}
