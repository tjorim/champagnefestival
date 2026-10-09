/**
 * Chart file export for the attendance chart.
 *
 * TanStack Charts renders the interactive legend as HTML buttons outside the
 * chart SVG, so `serializeChartSvg` leaves the reserved legend band empty. The
 * helpers here stamp a static legend into that band and size the file from the
 * chart's own viewBox so nothing is letterboxed.
 */

import { downloadChartImage, serializeChartSvg } from "@tanstack/charts/export";

const SVG_NS = "http://www.w3.org/2000/svg";
const EXPORT_WIDTH = 1200;
const LEGEND_BASELINE_Y = 26;
const LEGEND_START_X = 40;
const LEGEND_SWATCH_SIZE = 12;
const LEGEND_ITEM_GAP = 28;
const LEGEND_FONT_SIZE = 12;
const LEGEND_FONT_FAMILY = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export interface ExportLegendItem {
  label: string;
  /** CSS custom property that holds the series color, e.g. `--ts-chart-1`. */
  colorVar: string;
}

export interface ExportChartOptions {
  target: HTMLElement;
  filename: string;
  legend: readonly ExportLegendItem[];
  background: string;
}

function chartSvg(target: HTMLElement): SVGSVGElement {
  const svg = target.querySelector<SVGSVGElement>("svg.ts-chart");
  if (!svg) throw new Error("Chart SVG is not mounted");
  return svg;
}

function exportSize(svg: SVGSVGElement): { width: number; height: number } {
  const { width: viewWidth, height: viewHeight } = svg.viewBox.baseVal;
  const ratio = viewWidth > 0 && viewHeight > 0 ? viewHeight / viewWidth : 9 / 16;
  return { width: EXPORT_WIDTH, height: Math.round(EXPORT_WIDTH * ratio) };
}

function legendGroup(
  document: Document,
  target: HTMLElement,
  legend: readonly ExportLegendItem[],
): SVGGElement {
  const style = getComputedStyle(target);
  const textColor = style.getPropertyValue("--viz-text-secondary").trim() || "currentColor";
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("data-ts-key", "export-legend");

  let x = LEGEND_START_X;
  for (const item of legend) {
    const swatch = document.createElementNS(SVG_NS, "rect");
    swatch.setAttribute("x", String(x));
    swatch.setAttribute("y", String(LEGEND_BASELINE_Y - LEGEND_SWATCH_SIZE + 2));
    swatch.setAttribute("width", String(LEGEND_SWATCH_SIZE));
    swatch.setAttribute("height", String(LEGEND_SWATCH_SIZE));
    swatch.setAttribute("rx", "2");
    swatch.setAttribute("fill", style.getPropertyValue(item.colorVar).trim());

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(x + LEGEND_SWATCH_SIZE + 6));
    text.setAttribute("y", String(LEGEND_BASELINE_Y));
    text.setAttribute("fill", textColor);
    text.setAttribute("font-size", String(LEGEND_FONT_SIZE));
    text.setAttribute("font-family", LEGEND_FONT_FAMILY);
    text.textContent = item.label;

    group.append(swatch, text);
    // Approximate text width: enough to keep entries from overlapping.
    x += LEGEND_SWATCH_SIZE + 6 + item.label.length * LEGEND_FONT_SIZE * 0.6 + LEGEND_ITEM_GAP;
  }
  return group;
}

/** Serialized chart SVG (computed styles inlined) with the static legend added. */
function buildExportSvg({ target, legend }: ExportChartOptions): {
  svg: SVGSVGElement;
  size: { width: number; height: number };
} {
  const size = exportSize(chartSvg(target));
  const parsed = new DOMParser().parseFromString(serializeChartSvg(target, size), "image/svg+xml");
  const svg = parsed.documentElement as unknown as SVGSVGElement;
  svg.append(legendGroup(parsed, target, legend));
  return { svg, size };
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadAttendanceChartSvg(options: ExportChartOptions): void {
  const { svg } = buildExportSvg(options);
  const markup = new XMLSerializer().serializeToString(svg);
  saveBlob(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), options.filename);
}

export async function downloadAttendanceChartPng(options: ExportChartOptions): Promise<void> {
  const { svg, size } = buildExportSvg(options);
  // `downloadChartImage` rasterizes a mounted chart, so host the legend-bearing
  // copy off-screen inside the same themed container for the duration.
  const host = document.createElement("div");
  host.className = "viz-export-host";
  host.setAttribute("aria-hidden", "true");
  host.append(document.importNode(svg, true));
  options.target.parentElement?.append(host);
  try {
    await downloadChartImage(host, options.filename, {
      ...size,
      scale: 2,
      background: options.background,
    });
  } finally {
    host.remove();
  }
}
