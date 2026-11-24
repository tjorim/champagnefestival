import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Icon } from "@/components/Icon";
import { AdminField, AdminLabel, AdminInput, AdminTextarea } from "@/components/admin/AdminFields";
import { m } from "@/paraglide/messages";
import { SlideRenderer } from "../SlideRenderer";
import { signageIcons } from "../icons";
import { type TemplateDraft } from "../editorModel";
import type { Layer } from "../types";
import SignageLayerPanel from "../SignageLayerPanel";
import { bindingLabels } from "./templateLabels";
import { type TemplateEditorState } from "./useTemplateEditor";

interface TemplateWorkspaceProps {
  editor: TemplateEditorState;
}

/** The canvas, layer panel and layer inspector of the template editor. */
export function TemplateWorkspace({ editor }: TemplateWorkspaceProps) {
  const {
    viewport,
    change,
    layer,
    patchLayer,
    add,
    reorder,
    upload,
    preview,
    isText,
    isImage,
    fieldLabels,
    options,
    choose,
    start,
    move,
    finish,
    draft,
    selected,
    setSelected,
    busy,
    backgroundOpen,
    setBackgroundOpen,
    scale,
  } = editor;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div ref={viewport} className="site-signage-editor-viewport lg:col-span-2">
        {/* oxlint-disable shadcn/no-inline-styles -- The editor scales the shared 1920×1080 renderer and validated layer geometry to its measured viewport. */}
        <div className="site-signage-editor-canvas" style={{ transform: `scale(${scale})` }}>
          <SlideRenderer slide={preview} />
          {draft.layers
            .filter((item) => item.visible !== false)
            .map((item) => (
              <div
                key={item.id}
                className="site-signage-editor-selection"
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  width: `${item.width}%`,
                  height: `${item.height}%`,
                  transform: `rotate(${item.rotation}deg)`,
                }}
              >
                <button
                  type="button"
                  className="site-signage-editor-hit"
                  aria-label={`${m.signage_editor_move()}: ${item.name || (item.binding && bindingLabels()[item.binding]) || options[item.kind]}`}
                  aria-pressed={selected === item.id}
                  disabled={item.locked || busy}
                  onClick={() => setSelected(item.id)}
                  onPointerDown={(event) => start(event, item, "move")}
                  onPointerMove={move}
                  onPointerUp={() => finish()}
                  onPointerCancel={() => finish(true)}
                  onKeyDown={(event) => {
                    if (item.locked || busy) return;
                    const delta = event.shiftKey ? 5 : 1;
                    const directions: Record<string, Partial<Layer>> = {
                      ArrowLeft: { x: Math.max(0, item.x - delta) },
                      ArrowRight: { x: Math.min(100, item.x + delta) },
                      ArrowUp: { y: Math.max(0, item.y - delta) },
                      ArrowDown: { y: Math.min(100, item.y + delta) },
                    };
                    if (directions[event.key]) {
                      event.preventDefault();
                      setSelected(item.id);
                      change({
                        ...draft,
                        layers: draft.layers.map((layer) =>
                          layer.id === item.id ? { ...layer, ...directions[event.key] } : layer,
                        ),
                      });
                    }
                  }}
                />
                {selected === item.id &&
                  !item.locked &&
                  ["resize", "rotate"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`site-signage-editor-${mode}`}
                      style={{ width: 44 / scale, height: 44 / scale }}
                      aria-label={
                        mode === "resize" ? m.signage_editor_resize() : m.signage_editor_rotation()
                      }
                      onPointerDown={(event) => start(event, item, mode as "resize" | "rotate")}
                      onPointerMove={move}
                      onPointerUp={() => finish()}
                      onPointerCancel={() => finish(true)}
                    />
                  ))}
              </div>
            ))}
        </div>
        {/* oxlint-enable shadcn/no-inline-styles */}
      </div>
      <div className="min-w-0 space-y-4 lg:row-span-2">
        <SignageLayerPanel
          layers={draft.layers}
          selected={selected}
          busy={busy}
          bindingLabels={bindingLabels()}
          kindLabels={options}
          onSelect={setSelected}
          onMove={reorder}
          onAdd={add}
          onPatch={(id, patch) => {
            change({
              ...draft,
              layers: draft.layers.map((item) => (item.id === id ? { ...item, ...patch } : item)),
            });
          }}
        />
        <Collapsible
          open={backgroundOpen}
          onOpenChange={setBackgroundOpen}
          className="rounded-md border border-border p-3"
        >
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-sm text-left font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Icon icon={backgroundOpen ? ChevronDownIcon : ChevronRightIcon} />
            {fieldLabels.background}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {choose(
              fieldLabels.kind,
              draft.background.kind,
              ["color", "gradient", "image"],
              (value) =>
                change({
                  ...draft,
                  background: {
                    ...draft.background,
                    kind: value as TemplateDraft["background"]["kind"],
                  },
                }),
            )}
            {draft.background.kind !== "image" &&
              (draft.background.kind === "gradient"
                ? (["color", "end_color"] as const)
                : (["color"] as const)
              ).map((key) => (
                <AdminField key={key}>
                  <AdminLabel>{fieldLabels[key]}</AdminLabel>
                  <AdminInput
                    type="color"
                    disabled={busy}
                    value={draft.background[key]}
                    onChange={(event) =>
                      change({
                        ...draft,
                        background: { ...draft.background, [key]: event.target.value },
                      })
                    }
                  />
                </AdminField>
              ))}
            {draft.background.kind === "image" && (
              <AdminField>
                <AdminLabel>{m.signage_editor_upload()}</AdminLabel>
                <AdminInput
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(event) => void upload(event.target.files?.[0], "background")}
                />
              </AdminField>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
      {layer ? (
        <section
          aria-label={m.signage_editor_properties()}
          className="lg:col-span-2 space-y-4 rounded-md border border-border p-3"
        >
          <h3 className="font-semibold">{m.signage_editor_properties()}</h3>
          {layer.locked && <p className="text-sm text-subtle">{m.signage_editor_locked_help()}</p>}
          <fieldset disabled={busy || layer.locked} className="space-y-3">
            <legend className="mb-2 font-medium">{m.signage_editor_content()}</legend>
            <AdminField>
              <AdminLabel>{m.signage_editor_layer_name()}</AdminLabel>
              <AdminInput
                value={layer.name ?? ""}
                maxLength={100}
                onChange={(event) => patchLayer({ name: event.target.value })}
              />
            </AdminField>
            {layer.kind === "text" && (
              <AdminField>
                <AdminLabel>{fieldLabels.text}</AdminLabel>
                <AdminTextarea
                  value={layer.text}
                  maxLength={500}
                  onChange={(event) => patchLayer({ text: event.target.value })}
                />
              </AdminField>
            )}
            {layer.kind === "binding" &&
              choose(
                fieldLabels.binding,
                layer.binding ?? "name",
                Object.keys(bindingLabels()),
                (value) => patchLayer({ binding: value as Layer["binding"] }),
                layer.locked,
                bindingLabels(),
              )}
            {layer.kind === "image" && (
              <AdminField>
                <AdminLabel>{m.signage_editor_upload()}</AdminLabel>
                <AdminInput
                  type="file"
                  accept="image/*"
                  onChange={(event) => void upload(event.target.files?.[0], "layer")}
                />
              </AdminField>
            )}
            {layer.kind === "shape" &&
              choose(
                fieldLabels.shape,
                layer.shape,
                ["rectangle", "ellipse"],
                (value) => patchLayer({ shape: value as Layer["shape"] }),
                layer.locked,
              )}
            {layer.kind === "icon" &&
              choose(
                fieldLabels.icon,
                layer.icon ?? "info",
                Object.keys(signageIcons),
                (value) => patchLayer({ icon: value }),
                layer.locked,
              )}
          </fieldset>
          <fieldset disabled={busy || layer.locked} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 font-medium">{m.signage_editor_appearance()}</legend>
            {!isImage && (
              <AdminField>
                <AdminLabel>{fieldLabels.color}</AdminLabel>
                <AdminInput
                  type="color"
                  value={layer.color}
                  onChange={(event) => patchLayer({ color: event.target.value })}
                />
              </AdminField>
            )}
            {isText && (
              <>
                <AdminField>
                  <AdminLabel>{fieldLabels.font_size}</AdminLabel>
                  <AdminInput
                    type="number"
                    min={8}
                    max={300}
                    step={1}
                    value={layer.font_size}
                    onChange={(event) => {
                      if (event.target.value && event.target.validity.valid)
                        patchLayer({ font_size: Number(event.target.value) });
                    }}
                  />
                </AdminField>
                {choose(
                  fieldLabels.font,
                  layer.font ?? "sans",
                  ["sans", "serif", "mono"],
                  (value) => patchLayer({ font: value as Layer["font"] }),
                  layer.locked,
                )}
                {choose(
                  fieldLabels.align,
                  layer.align ?? "center",
                  ["left", "center", "right"],
                  (value) => patchLayer({ align: value as Layer["align"] }),
                  layer.locked,
                )}
              </>
            )}
            {isImage &&
              choose(
                fieldLabels.fit,
                layer.fit ?? "contain",
                ["contain", "cover"],
                (value) => patchLayer({ fit: value as Layer["fit"] }),
                layer.locked,
              )}
          </fieldset>
          <fieldset disabled={busy || layer.locked} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 font-medium">{m.signage_editor_position()}</legend>
            {(["x", "y", "width", "height", "rotation"] as const).map((key) => (
              <AdminField key={key}>
                <AdminLabel>{fieldLabels[key]}</AdminLabel>
                <AdminInput
                  type="number"
                  step="any"
                  value={layer[key]}
                  min={key === "rotation" ? -360 : key === "width" || key === "height" ? 1 : 0}
                  max={key === "rotation" ? 360 : 100}
                  onChange={(event) => {
                    if (event.target.value && event.target.validity.valid)
                      patchLayer({ [key]: Number(event.target.value) });
                  }}
                />
              </AdminField>
            ))}
          </fieldset>
          <Button
            variant="destructive"
            disabled={busy || !!layer.locked}
            onClick={() => {
              change({
                ...draft,
                layers: draft.layers.filter((item) => item.id !== selected),
              });
              setSelected(null);
            }}
          >
            {m.signage_editor_remove()}
          </Button>
        </section>
      ) : (
        <p className="lg:col-span-2 text-sm text-subtle">{m.signage_editor_select_layer()}</p>
      )}
    </div>
  );
}
