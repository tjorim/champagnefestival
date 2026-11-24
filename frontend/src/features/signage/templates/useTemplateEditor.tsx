import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminField, AdminLabel, AdminSelect, AdminOption } from "@/components/admin/AdminFields";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
  addMissingBindings,
  moveLayer,
  emptyTemplate,
  missingBindings,
  newLayer,
  resizeLayer,
  type Template,
  type TemplateDraft,
  type TemplateKind,
} from "../editorModel";
import type { Layer, PublicSlide } from "../types";
import { labels, optionLabels } from "./templateLabels";

export type Organization = import("@/api-types").OrganizationOut;
export type Notice = import("@/api-types").SlideOut;

interface TemplateEditorOptions {
  template: Template | null;
  onSaved: (template: Template) => void;
  initialKind?: TemplateKind;
}

/** The signage template editor's draft, undo history, layer actions and save/upload flow. */
export function useTemplateEditor({ template, onSaved, initialKind }: TemplateEditorOptions) {
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
      fetchJsonOrThrow<Organization[]>(
        "/api/organizations?limit=1000",
        { signal },
        m.admin_error_load_data(),
      ),
  });
  const notices = useQuery({
    queryKey: ["admin", "signage", "samples", "notices"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrow<Notice[]>("/api/signage/slides", { signal }, m.admin_error_load_data()),
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
      const saved = await fetchJsonOrThrow<Template>(
        `/api/signage/templates${id ? `/${id}` : ""}`,
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
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
      const result = await fetchJsonOrThrow<import("@/api-types").SignageAssetOut>(
        "/api/signage/assets",
        { method: "POST", body },
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
          sponsor_tier: null,
          description: org[`description_${locale}`] || org.description_nl,
        }
      : kind === "organizations"
        ? {
            name: m.signage_sample_title(),
            description: m.signage_sample_text(),
            logo: "/signage-sample.svg",
            sponsor: true,
            sponsor_tier: null,
          }
        : null,
    title: content ? (content.title ?? null) : m.signage_sample_title(),
    text: content ? (content.text ?? null) : m.signage_sample_text(),
    icon: content ? (content.icon ?? null) : "info",
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

  return {
    initial,
    id,
    viewport,
    gesture,
    organizations,
    notices,
    change,
    undo,
    redo,
    layer,
    patchLayer,
    add,
    reorder,
    save,
    upload,
    samples,
    org,
    notice,
    content,
    locale,
    preview,
    missing,
    isText,
    isImage,
    fieldLabels,
    options,
    choose,
    start,
    move,
    finish,
    draft,
    setDraft,
    selected,
    setSelected,
    past,
    setPast,
    future,
    setFuture,
    kind,
    setKind,
    sample,
    setSample,
    error,
    setError,
    busy,
    setBusy,
    backgroundOpen,
    setBackgroundOpen,
    scale,
    setScale,
  };
}

export type TemplateEditorState = ReturnType<typeof useTemplateEditor>;
