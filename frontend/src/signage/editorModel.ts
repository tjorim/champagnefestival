import type { Background, Layer } from "./types";
export interface TemplateDraft {
  name: string;
  background: Background;
  layers: Layer[];
}
export interface Template extends TemplateDraft {
  id: string;
}
export type TemplateKind = "organizations" | "notice" | "image";
export const requiredBindings = {
  organizations: ["logo", "name", "sponsor"],
  notice: ["title", "text"],
  image: [],
} as const;
export function missingBindings(draft: TemplateDraft, kind: TemplateKind) {
  return requiredBindings[kind].filter(
    (binding) =>
      !draft.layers.some(
        (layer) => layer.kind === "binding" && layer.binding === binding && layer.visible !== false,
      ),
  );
}
export function newLayer(kind: Layer["kind"], binding: Layer["binding"] = null): Layer {
  return {
    id: crypto.randomUUID(),
    kind,
    binding,
    text: "",
    image: null,
    icon: "info",
    shape: "rectangle",
    x: 10,
    y: 10,
    width: 40,
    height: 20,
    rotation: 0,
    color: "#ffffff",
    font_size: 48,
    name: "",
    visible: true,
    locked: false,
    font: "sans",
    align: "center",
    fit: "contain",
  };
}
export function emptyTemplate(): TemplateDraft {
  return {
    name: "",
    background: { kind: "color", color: "#000000", end_color: "#000000", image: null },
    layers: [],
  };
}

/** Restore existing slots before adding new ones, preserving IDs and artwork. */
export function addMissingBindings(draft: TemplateDraft, kind: TemplateKind): TemplateDraft {
  const layers = [...draft.layers];
  for (const binding of missingBindings(draft, kind)) {
    const hidden = layers.findIndex(
      (layer) => layer.kind === "binding" && layer.binding === binding && !layer.locked,
    );
    if (hidden !== -1) {
      layers[hidden] = { ...layers[hidden]!, visible: true };
    } else if (layers.length < 100) {
      // Keep the starter slots separate; all geometry remains editable.
      const position: Partial<Layer> = {
        logo: { x: 10, y: 15, width: 25, height: 45 },
        name: { x: 40, y: 20, width: 50, height: 20 },
        sponsor: { x: 40, y: 50, width: 50, height: 15 },
        title: { x: 10, y: 15, width: 80, height: 20 },
        text: { x: 10, y: 40, width: 80, height: 45 },
      }[binding];
      layers.push({ ...newLayer("binding", binding), ...position });
    }
  }
  return { ...draft, layers };
}

/** Array order is back to front; the layer panel displays the reverse. */
export function moveLayer(layers: Layer[], from: number, to: number): Layer[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= layers.length ||
    to >= layers.length ||
    layers[from]?.locked
  )
    return layers;
  const next = [...layers];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}

/** Pointer deltas are canvas pixels; resize follows the layer's rotated axes. */
export function resizeLayer(layer: Layer, dx: number, dy: number): Partial<Layer> {
  const angle = (layer.rotation * Math.PI) / 180;
  const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
  const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const width = Math.max(1, Math.min(100, layer.width + (localX / 1920) * 100));
  const height = Math.max(1, Math.min(100, layer.height + (localY / 1080) * 100));
  const dw = ((width - layer.width) / 100) * 1920;
  const dh = ((height - layer.height) / 100) * 1080;
  return {
    width,
    height,
    x: Math.max(
      0,
      Math.min(
        100,
        layer.x + ((dw * Math.cos(angle) - dh * Math.sin(angle) - dw) / 2 / 1920) * 100,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        100,
        layer.y + ((dw * Math.sin(angle) + dh * Math.cos(angle) - dh) / 2 / 1080) * 100,
      ),
    ),
  };
}

/** Mirrors the bounded JSON contract; missing optional fields retain legacy defaults. */
export function validTemplate(draft: TemplateDraft): boolean {
  const color = /^#[0-9a-fA-F]{6}$/;
  const asset = /^\/uploads\/signage\/[a-f0-9]{32}-[a-f0-9]{64}\.jpg$/;
  const image = (value: string | null) => value === null || asset.test(value);
  const bounded = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value >= min && value <= max;
  const background = draft.background;
  return (
    Boolean(draft.name.trim()) &&
    draft.name.length <= 200 &&
    ["color", "gradient", "image"].includes(background.kind) &&
    color.test(background.color) &&
    color.test(background.end_color) &&
    image(background.image) &&
    (background.kind !== "image" || Boolean(background.image)) &&
    draft.layers.length <= 100 &&
    new Set(draft.layers.map((layer) => layer.id)).size === draft.layers.length &&
    draft.layers.every(
      (layer) =>
        layer.id.length > 0 &&
        layer.id.length <= 64 &&
        ["binding", "text", "image", "icon", "shape"].includes(layer.kind) &&
        (layer.binding === null ||
          ["logo", "name", "description", "sponsor", "title", "text", "icon"].includes(
            layer.binding,
          )) &&
        (layer.kind !== "binding" || Boolean(layer.binding)) &&
        layer.text.length <= 500 &&
        (layer.name?.length ?? 0) <= 100 &&
        image(layer.image) &&
        (layer.kind !== "image" || Boolean(layer.image)) &&
        (layer.icon === null || (layer.icon.length <= 80 && /^[a-z0-9-]+$/.test(layer.icon))) &&
        ["rectangle", "ellipse"].includes(layer.shape) &&
        color.test(layer.color) &&
        bounded(layer.x, 0, 100) &&
        bounded(layer.y, 0, 100) &&
        bounded(layer.width, Number.MIN_VALUE, 100) &&
        bounded(layer.height, Number.MIN_VALUE, 100) &&
        bounded(layer.rotation, -360, 360) &&
        Number.isInteger(layer.font_size) &&
        bounded(layer.font_size, 8, 300) &&
        ["sans", "serif", "mono"].includes(layer.font ?? "sans") &&
        ["left", "center", "right"].includes(layer.align ?? "center") &&
        ["contain", "cover"].includes(layer.fit ?? "contain") &&
        (layer.visible === undefined || typeof layer.visible === "boolean") &&
        (layer.locked === undefined || typeof layer.locked === "boolean"),
    )
  );
}
