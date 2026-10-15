import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminCheck,
} from "./AdminFields";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { SlideRenderer } from "@/signage/SlideRenderer";
import { signageIcons } from "@/signage/icons";
import {
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
  x: "X (%)",
  y: "Y (%)",
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
  description_language: "nl" | "fr" | "en" | null;
  description_nl: string | null;
  description_fr: string | null;
  description_en: string | null;
}
interface Notice {
  id: string;
  kind: string;
  content: {
    text_language: "nl" | "fr" | "en";
    text_nl: string | null;
    text_fr: string | null;
    text_en: string | null;
    title_nl: string | null;
    title_fr: string | null;
    title_en: string | null;
    icon: string | null;
    image: string | null;
  };
}

export default function SignageTemplates({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(emptyTemplate);
  const [id, setId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<TemplateDraft[]>([]);
  const [future, setFuture] = useState<TemplateDraft[]>([]);
  const [kind, setKind] = useState<TemplateKind>("organizations");
  const [sample, setSample] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
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
  const templates = useQuery({
    queryKey: ["admin", "signage", "templates"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrowWithUnauthorized<Template[]>(
        "/api/signage/templates",
        { headers: authHeaders(), signal },
        m.admin_error_load_data(),
      ),
  });
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
    setSaved(false);
  }
  function undo() {
    const previous = past.at(-1);
    if (previous) {
      setFuture([draft, ...future]);
      setDraft(previous);
      setPast(past.slice(0, -1));
      setSaved(false);
    }
  }
  function redo() {
    if (future[0]) {
      setPast([...past, draft]);
      setDraft(future[0]);
      setFuture(future.slice(1));
      setSaved(false);
    }
  }
  function load(template?: Template) {
    setId(template?.id ?? null);
    setDraft(
      template
        ? { name: template.name, background: template.background, layers: template.layers }
        : emptyTemplate(),
    );
    setPast([]);
    setFuture([]);
    setSelected(null);
    setError("");
    setSaved(false);
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
    const item = newLayer(type, binding);
    change({ ...draft, layers: [...draft.layers, item] });
    setSelected(item.id);
  }
  function reorder(delta: number) {
    if (!layer) return;
    const layers = [...draft.layers];
    const from = layers.indexOf(layer);
    const to = from + delta;
    if (to < 0 || to >= layers.length) return;
    [layers[from], layers[to]] = [layers[to]!, layers[from]!];
    change({ ...draft, layers });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await fetchJsonOrThrowWithUnauthorized<Template>(
        `/api/signage/templates${id ? `/${id}` : ""}`,
        {
          method: id ? "PUT" : "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
        m.signage_editor_error(),
      );
      setId(result.id);
      setSaved(true);
      await templates.refetch();
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
          description:
            org[`description_${locale}`] ||
            (org.description_language ? org[`description_${org.description_language}`] : null),
        }
      : null,
    title: content?.[`title_${locale}`] || content?.[`title_${content.text_language}`] || null,
    text: content?.[`text_${locale}`] || content?.[`text_${content.text_language}`] || null,
    icon: content?.icon ?? null,
    image: kind === "image" ? (content?.image ?? null) : null,
  };
  const missing = missingBindings(draft, kind);
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
    setSaved(false);
  }
  function finish(cancel = false) {
    const current = gesture.current;
    if (!current) return;
    if (cancel) setDraft(current.draft);
    else {
      setPast((items) => [...items.slice(-99), current.draft]);
      setFuture([]);
    }
    gesture.current = null;
  }
  return (
    <div className="flex flex-col gap-4" aria-busy={busy}>
      <h2 className="text-xl font-semibold">{m.signage_editor_heading()}</h2>
      {(error || templates.error || organizations.error || notices.error) && (
        <Alert variant="danger">{error || m.admin_error_load_data()}</Alert>
      )}
      {saved && <p role="status">{m.signage_editor_saved()}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => load()}>
          {m.signage_editor_new()}
        </Button>
        <Button
          disabled={busy || !validTemplate(draft) || missing.length > 0}
          onClick={() => void save()}
        >
          {m.signage_editor_save()}
        </Button>
        <Button disabled={busy || !past.length} onClick={undo}>
          {m.signage_editor_undo()}
        </Button>
        <Button disabled={busy || !future.length} onClick={redo}>
          {m.signage_editor_redo()}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {templates.data?.map((template) => (
          <Button
            key={template.id}
            variant={id === template.id ? "default" : "outline"}
            disabled={busy}
            onClick={() => load(template)}
          >
            {template.name}
          </Button>
        ))}
      </div>
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
        false,
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
              "name" in item
                ? item.name
                : item.content[`title_${item.content.text_language}`] || item.id,
            ]),
          ),
        )
      ) : (
        <p>{m.signage_editor_no_samples()}</p>
      )}
      {missing.length > 0 && (
        <Alert>
          {m.signage_editor_missing()} {missing.map((key) => bindingLabels()[key]).join(", ")}
        </Alert>
      )}
      <div ref={viewport} className="site-signage-editor-viewport">
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
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-2">
          <h3>{m.signage_editor_layers()}</h3>
          {draft.layers.map((item) => (
            <Button
              variant={selected === item.id ? "default" : "outline"}
              key={item.id}
              onClick={() => setSelected(item.id)}
            >
              {item.name || (item.binding && bindingLabels()[item.binding]) || options[item.kind]}
            </Button>
          ))}
          {choose(
            m.signage_editor_add(),
            "",
            ["binding", "text", "image", "icon", "shape"],
            (value) => add(value as Layer["kind"], value === "binding" ? "name" : null),
          )}
          {layer && (
            <>
              <Button disabled={busy || !!layer.locked} onClick={() => reorder(-1)}>
                {m.signage_editor_back()}
              </Button>
              <Button disabled={busy || !!layer.locked} onClick={() => reorder(1)}>
                {m.signage_editor_front()}
              </Button>
              <Button
                disabled={busy || !!layer.locked}
                onClick={() => {
                  change({ ...draft, layers: draft.layers.filter((item) => item.id !== selected) });
                  setSelected(null);
                }}
              >
                {m.signage_editor_remove()}
              </Button>
            </>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h3>{fieldLabels.background}</h3>
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
          {(["color", "end_color"] as const).map((key) => (
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
          <AdminField>
            <AdminLabel>{m.signage_editor_upload()}</AdminLabel>
            <AdminInput
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(event) => void upload(event.target.files?.[0], "background")}
            />
          </AdminField>
        </section>
        {layer && (
          <section className="flex flex-col gap-2">
            <h3>{m.signage_editor_properties()}</h3>
            <AdminCheck
              checked={layer.locked ?? false}
              disabled={busy}
              onCheckedChange={(checked) => patchLayer({ locked: checked === true })}
              label={m.signage_editor_locked()}
            />
            <AdminCheck
              checked={layer.visible !== false}
              disabled={busy || layer.locked}
              onCheckedChange={(checked) => patchLayer({ visible: checked === true })}
              label={m.signage_editor_visible()}
            />
            {(["name", "text", "color"] as const).map((key) => (
              <AdminField key={key}>
                <AdminLabel>{fieldLabels[key]}</AdminLabel>
                <AdminInput
                  type={key === "color" ? "color" : "text"}
                  value={layer[key] ?? ""}
                  maxLength={key === "name" ? 100 : 500}
                  disabled={busy || layer.locked}
                  onChange={(event) => patchLayer({ [key]: event.target.value })}
                />
              </AdminField>
            ))}
            {(["x", "y", "width", "height", "rotation", "font_size"] as const).map((key) => (
              <AdminField key={key}>
                <AdminLabel>{fieldLabels[key]}</AdminLabel>
                <AdminInput
                  type="number"
                  step={key === "font_size" ? 1 : "any"}
                  value={layer[key]}
                  min={
                    key === "rotation"
                      ? -360
                      : key === "font_size"
                        ? 8
                        : key === "width" || key === "height"
                          ? 1
                          : 0
                  }
                  max={key === "rotation" ? 360 : key === "font_size" ? 300 : 100}
                  disabled={busy || layer.locked}
                  onChange={(event) => {
                    const input = event.target;
                    if (input.value && input.validity.valid)
                      patchLayer({ [key]: Number(input.value) });
                  }}
                />
              </AdminField>
            ))}
            {layer.kind === "binding" &&
              choose(
                fieldLabels.binding,
                layer.binding ?? "name",
                Object.keys(bindingLabels()),
                (value) => patchLayer({ binding: value as Layer["binding"] }),
                layer.locked,
                bindingLabels(),
              )}
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
            {choose(
              fieldLabels.fit,
              layer.fit ?? "contain",
              ["contain", "cover"],
              (value) => patchLayer({ fit: value as Layer["fit"] }),
              layer.locked,
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
            {layer.kind === "image" && (
              <AdminField>
                <AdminLabel>{m.signage_editor_upload()}</AdminLabel>
                <AdminInput
                  type="file"
                  accept="image/*"
                  disabled={busy || layer.locked}
                  onChange={(event) => void upload(event.target.files?.[0], "layer")}
                />
              </AdminField>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
