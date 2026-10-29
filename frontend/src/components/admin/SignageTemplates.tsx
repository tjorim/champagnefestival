import { AdminEmptyState } from "./AdminEmptyState";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminTextarea,
} from "./AdminFields";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { SlideRenderer } from "@/signage/SlideRenderer";
import { signageIcons } from "@/signage/icons";
import {
  addMissingBindings,
  moveLayer,
  emptyTemplate,
  missingBindings,
  newLayer,
  resizeLayer,
  validTemplate,
  type Template,
  type TemplateDraft,
  type TemplateKind,
} from "@/signage/editorModel";
import type { Layer, PublicSlide } from "@/signage/types";
import "@/signage/editor.css";
import AdminEditorDialog from "./AdminEditorDialog";
import SignageLayerPanel from "./SignageLayerPanel";
import { PencilIcon } from "lucide-react";
import { AdminAddButton, RowActionButton, RowActions } from "./RowActions";

const labels = () => ({
  name: m.signage_editor_name(),
  background: m.signage_editor_background(),
  color: m.signage_editor_colour(),
  end_color: m.signage_editor_end_colour(),
  kind: m.signage_editor_kind(),
  binding: m.signage_editor_binding(),
  text: m.signage_editor_text(),
  image: m.signage_editor_image(),
  icon: m.signage_editor_icon(),
  shape: m.signage_editor_shape(),
  x: m.signage_editor_x(),
  y: m.signage_editor_y(),
  width: m.signage_editor_width(),
  height: m.signage_editor_height(),
  rotation: m.signage_editor_rotation(),
  font_size: m.signage_editor_font_size(),
  font: m.signage_editor_font(),
  align: m.signage_editor_align(),
  fit: m.signage_editor_fit(),
});
const bindingLabels = () => ({
  logo: m.signage_editor_logo(),
  name: m.signage_editor_name(),
  description: m.signage_editor_description(),
  sponsor: m.admin_item_sponsor(),
  title: m.signage_editor_title(),
  text: m.signage_editor_text(),
  icon: m.signage_editor_icon(),
});
const optionLabels = (): Record<string, string> => ({
  color: m.signage_editor_colour(),
  gradient: m.signage_editor_gradient(),
  image: m.signage_editor_image(),
  binding: m.signage_editor_binding(),
  text: m.signage_editor_text(),
  icon: m.signage_editor_icon(),
  shape: m.signage_editor_shape(),
  rectangle: m.signage_editor_rectangle(),
  ellipse: m.signage_editor_ellipse(),
  sans: "Arial",
  serif: "Georgia",
  mono: "Monospace",
  left: m.signage_editor_left(),
  center: m.signage_editor_centre(),
  right: m.signage_editor_right(),
  contain: m.signage_editor_contain(),
  cover: m.signage_editor_cover(),
});
interface Organization {
  id: number;
  name: string;
  image: string;
  type: string;
  description_nl: string | null;
  description_fr: string | null;
  description_en: string | null;
}
interface Notice {
  id: string;
  kind: string;
  content: {
    title: string | null;
    text: string | null;
    icon: string | null;
    image: string | null;
  };
}

export default function SignageTemplates({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const [editing, setEditing] = useState<Template | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const templates = useQuery({
    queryKey: ["admin", "signage", "templates"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrowWithUnauthorized<Template[]>(
        "/api/signage/templates",
        { headers: authHeaders(), signal },
        m.admin_error_load_data(),
      ),
  });
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{m.signage_editor_heading()}</h2>
      {templates.error && <Alert variant="danger">{m.admin_error_load_data()}</Alert>}
      {saved && <p role="status">{m.signage_editor_saved()}</p>}
      <AdminAddButton
        onClick={() => {
          setSaved(false);
          setEditing(null);
        }}
      >
        {m.signage_editor_new()}
      </AdminAddButton>
      <ul className="space-y-2">
        {templates.data?.map((template) => (
          <li key={template.id} className="flex items-center justify-between gap-2">
            <span>{template.name}</span>
            <RowActions>
              <RowActionButton
                icon={PencilIcon}
                label={m.admin_edit_item({ name: template.name })}
                onClick={() => {
                  setSaved(false);
                  setEditing(template);
                }}
              />
            </RowActions>
          </li>
        ))}
      </ul>
      {editing !== undefined && (
        <TemplateEditor
          authHeaders={authHeaders}
          template={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setSaved(true);
            void templates.refetch();
          }}
        />
      )}
    </div>
  );
}

export function TemplateEditor({
  authHeaders,
  template,
  onClose,
  onSaved,
  initialKind,
}: {
  authHeaders: () => Record<string, string>;
  template: Template | null;
  onClose: () => void;
  onSaved: (template: Template) => void;
  initialKind?: TemplateKind;
}) {
  const [initial] = useState<TemplateDraft>(() =>
    template
      ? { name: template.name, background: template.background, layers: template.layers }
      : initialKind
        ? addMissingBindings(emptyTemplate(), initialKind)
        : emptyTemplate(),
  );
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const id = template?.id;
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<TemplateDraft[]>([]);
  const [future, setFuture] = useState<TemplateDraft[]>([]);
  const [kind, setKind] = useState<TemplateKind>(initialKind ?? "organizations");
  const [sample, setSample] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [scale, setScale] = useState(0.3);
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    draft: TemplateDraft;
    layer: Layer;
    x: number;
    y: number;
    mode: "move" | "resize" | "rotate";
    centerX: number;
    centerY: number;
  } | null>(null);
  const organizations = useQuery({
    queryKey: ["admin", "signage", "samples", "organizations"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrowWithUnauthorized<Organization[]>(
        "/api/organizations?limit=1000",
        { headers: authHeaders(), signal },
        m.admin_error_load_data(),
      ),
  });
  const notices = useQuery({
    queryKey: ["admin", "signage", "samples", "notices"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrowWithUnauthorized<Notice[]>(
        "/api/signage/slides",
        { headers: authHeaders(), signal },
        m.admin_error_load_data(),
      ),
  });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setScale((entry?.contentRect.width ?? 576) / 1920),
    );
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  function change(next: TemplateDraft) {
    setPast((items) => [...items.slice(-99), draft]);
    setFuture([]);
    setDraft(next);
  }
  function undo() {
    const previous = past.at(-1);
    if (previous) {
      setFuture([draft, ...future]);
      setDraft(previous);
      setPast(past.slice(0, -1));
    }
  }
  function redo() {
    if (future[0]) {
      setPast([...past, draft]);
      setDraft(future[0]);
      setFuture(future.slice(1));
    }
  }
  const layer = draft.layers.find((item) => item.id === selected);
  function patchLayer(patch: Partial<Layer>) {
    if (layer)
      change({
        ...draft,
        layers: draft.layers.map((item) => (item.id === layer.id ? { ...item, ...patch } : item)),
      });
  }
  function add(type: Layer["kind"], binding: Layer["binding"] = null) {
    if (busy || draft.layers.length >= 100) return;
    const item = newLayer(type, binding);
    change({ ...draft, layers: [...draft.layers, item] });
    setSelected(item.id);
  }
  function reorder(from: number, to: number) {
    if (busy) return;
    const layers = moveLayer(draft.layers, from, to);
    if (layers !== draft.layers) change({ ...draft, layers });
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await fetchJsonOrThrowWithUnauthorized<Template>(
        `/api/signage/templates${id ? `/${id}` : ""}`,
        {
          method: id ? "PUT" : "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
        m.signage_editor_error(),
      );
      onSaved(saved);
    } catch (cause) {
      setError(apiErrorMessage(cause, m.signage_editor_error()));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined, target: "background" | "layer") {
    if (!file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const headers = { ...authHeaders() };
      delete headers["Content-Type"];
      const result = await fetchJsonOrThrowWithUnauthorized<{ url: string }>(
        "/api/signage/assets",
        { method: "POST", headers, body },
        m.signage_editor_error(),
      );
      if (target === "background")
        change({ ...draft, background: { ...draft.background, kind: "image", image: result.url } });
      else patchLayer({ image: result.url });
    } catch (cause) {
      setError(apiErrorMessage(cause, m.signage_editor_error()));
    } finally {
      setBusy(false);
    }
  }
  const samples =
    kind === "organizations"
      ? (organizations.data ?? [])
      : (notices.data ?? []).filter((item) => item.kind === kind);
  const org =
    kind === "organizations"
      ? ((organizations.data ?? []).find((item) => String(item.id) === sample) ??
        organizations.data?.[0])
      : undefined;
  const notice =
    kind !== "organizations"
      ? ((notices.data ?? []).find((item) => item.id === sample && item.kind === kind) ??
        (samples[0] as Notice | undefined))
      : undefined;
  const content = notice?.content;
  const locale = getLocale();
  const preview: PublicSlide = {
    id: "preview",
    kind: kind === "organizations" ? "organization" : kind,
    duration: 10,
    template: draft,
    organization: org
      ? {
          name: org.name,
          logo: org.image,
          sponsor: org.type === "sponsor",
          description: org[`description_${locale}`] || org.description_nl,
        }
      : kind === "organizations"
        ? {
            name: m.signage_sample_title(),
            description: m.signage_sample_text(),
            logo: "/signage-sample.svg",
            sponsor: true,
          }
        : null,
    title: content ? content.title : m.signage_sample_title(),
    text: content ? content.text : m.signage_sample_text(),
    icon: content ? content.icon : "info",
    image: kind === "image" ? (content?.image ?? "/signage-sample.svg") : null,
  };
  const missing = missingBindings(draft, kind);
  const isText =
    layer &&
    (layer.kind === "text" ||
      (layer.kind === "binding" &&
        ["name", "description", "sponsor", "title", "text"].includes(layer.binding ?? "")));
  const isImage =
    layer && (layer.kind === "image" || (layer.kind === "binding" && layer.binding === "logo"));
  const fieldLabels = labels();
  const options = optionLabels();
  function choose(
    label: string,
    value: string,
    values: readonly string[],
    onChange: (value: string) => void,
    disabled = false,
    names = options,
  ) {
    return (
      <AdminField>
        <AdminLabel>{label}</AdminLabel>
        <AdminSelect
          value={value}
          disabled={disabled || busy}
          onValueChange={(value) => onChange(String(value))}
        >
          {values.map((value) => (
            <AdminOption key={value} value={value}>
              {names[value] ?? value}
            </AdminOption>
          ))}
        </AdminSelect>
      </AdminField>
    );
  }
  function start(
    event: PointerEvent<HTMLButtonElement>,
    item: Layer,
    mode: "move" | "resize" | "rotate",
  ) {
    if (item.locked || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(item.id);
    const bounds = viewport.current!.getBoundingClientRect();
    gesture.current = {
      draft,
      layer: item,
      x: event.clientX,
      y: event.clientY,
      mode,
      centerX: bounds.left + ((item.x + item.width / 2) / 100) * 1920 * scale,
      centerY: bounds.top + ((item.y + item.height / 2) / 100) * 1080 * scale,
    };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = ((event.clientX - current.x) / scale / 1920) * 100;
    const dy = ((event.clientY - current.y) / scale / 1080) * 100;
    const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
    const patch =
      current.mode === "move"
        ? { x: clamp(current.layer.x + dx), y: clamp(current.layer.y + dy) }
        : current.mode === "resize"
          ? resizeLayer(current.layer, (dx / 100) * 1920, (dy / 100) * 1080)
          : {
              rotation: clamp(
                current.layer.rotation +
                  ((Math.atan2(event.clientY - current.centerY, event.clientX - current.centerX) -
                    Math.atan2(current.y - current.centerY, current.x - current.centerX)) *
                    180) /
                    Math.PI,
                -360,
                360,
              ),
            };
    setDraft({
      ...current.draft,
      layers: current.draft.layers.map((item) =>
        item.id === current.layer.id ? { ...item, ...patch } : item,
      ),
    });
  }
  function finish(cancel = false) {
    const current = gesture.current;
    if (!current) return;
    if (cancel) setDraft(current.draft);
    // Compare content: pointer moves can create new objects without changing geometry.
    else if (JSON.stringify(draft) !== JSON.stringify(current.draft)) {
      setPast((items) => [...items.slice(-99), current.draft]);
      setFuture([]);
    }
    gesture.current = null;
  }
  return (
    <AdminEditorDialog
      title={template ? m.admin_edit_item({ name: template.name }) : m.signage_editor_new()}
      size="xl"
      busy={busy}
      dirty={JSON.stringify(draft) !== JSON.stringify(initial)}
      onClose={onClose}
      footer={
        <>
          {(!validTemplate(draft) || missing.length > 0) && (
            <p>{m.signage_template_requirements()}</p>
          )}
          <Button
            disabled={busy || !validTemplate(draft) || missing.length > 0}
            onClick={() => void save()}
          >
            {m.signage_editor_save()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {(error || organizations.error || notices.error) && (
          <Alert variant="danger">{error || m.admin_error_load_data()}</Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !past.length} onClick={undo}>
            {m.signage_editor_undo()}
          </Button>
          <Button disabled={busy || !future.length} onClick={redo}>
            {m.signage_editor_redo()}
          </Button>
        </div>
        <div className="grid items-start gap-3 md:grid-cols-3">
          <AdminField>
            <AdminLabel>{fieldLabels.name}</AdminLabel>
            <AdminInput
              maxLength={200}
              value={draft.name}
              disabled={busy}
              onChange={(event) => change({ ...draft, name: event.target.value })}
            />
          </AdminField>
          {choose(
            m.signage_editor_preview_kind(),
            kind,
            ["organizations", "notice", "image"],
            (value) => {
              setKind(value as TemplateKind);
              setSample("");
            },
            Boolean(initialKind),
            {
              organizations: m.signage_editor_organisations(),
              notice: m.signage_editor_notice(),
              image: m.signage_editor_image(),
            },
          )}
          {samples.length > 0 ? (
            choose(
              m.signage_editor_sample(),
              sample || String(samples[0]!.id),
              samples.map((item) => String(item.id)),
              setSample,
              false,
              Object.fromEntries(
                samples.map((item) => [
                  String(item.id),
                  "name" in item ? item.name : item.content.title || item.id,
                ]),
              ),
            )
          ) : (
            <AdminEmptyState>{m.signage_editor_no_samples()}</AdminEmptyState>
          )}
        </div>
        {missing.length > 0 && (
          <Alert>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {m.signage_editor_missing()} {missing.map((key) => bindingLabels()[key]).join(", ")}
              </span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const next = addMissingBindings(draft, kind);
                  if (JSON.stringify(next) !== JSON.stringify(draft)) change(next);
                  const first = next.layers.find(
                    (item) =>
                      item.kind === "binding" &&
                      missing.some((binding) => binding === item.binding) &&
                      item.visible !== false,
                  );
                  if (first) setSelected(first.id);
                }}
              >
                {m.signage_editor_add_missing()}
              </Button>
            </div>
          </Alert>
        )}
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
                            mode === "resize"
                              ? m.signage_editor_resize()
                              : m.signage_editor_rotation()
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
                  layers: draft.layers.map((item) =>
                    item.id === id ? { ...item, ...patch } : item,
                  ),
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
              {layer.locked && (
                <p className="text-sm text-subtle">{m.signage_editor_locked_help()}</p>
              )}
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
      </div>
    </AdminEditorDialog>
  );
}
