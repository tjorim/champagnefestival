import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronUpIcon, ChevronDownIcon, GripVerticalIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminCheck,
  AdminTextarea,
} from "./AdminFields";
import {
  signageRequest,
  signageOperationErrorMessage,
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { missingBindings, type Template } from "@/signage/editorModel";
import {
  emptySlide,
  validSlide,
  moveSlide,
  localSchedule,
  type Channel,
  type ChannelDraft,
  type Slide,
  type SlideDraft,
} from "@/signage/playlistModel";
import type { Playlist } from "@/signage/types";
import { SlideRenderer } from "@/signage/SlideRenderer";
import { signageIcons } from "@/signage/icons";
import "@/signage/editor.css";
import SignageVideoExports from "./SignageVideoExports";
import AdminEditorDialog from "./AdminEditorDialog";

const channelPath = (slug: string) => `/signage/${slug}`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <AdminField>
      <AdminLabel>{label}</AdminLabel>
      {children}
    </AdminField>
  );
}
function Row({
  slide,
  index,
  count,
  busy,
  label,
  edit,
  move,
}: {
  slide: Slide;
  index: number;
  count: number;
  busy: boolean;
  label: string;
  edit: () => void;
  move: (from: number, to: number) => void;
}) {
  const { ref, handleRef } = useSortable({ id: slide.id, index, disabled: busy });
  return (
    <li ref={ref} className="flex flex-wrap items-center gap-2 rounded border p-2">
      <Button
        className="hover:bg-primary"
        ref={handleRef}
        disabled={busy}
        aria-label={m.signage_channels_drag({ name: label })}
      >
        <Icon icon={GripVerticalIcon} />
      </Button>
      <Button variant="ghost" disabled={busy} onClick={edit}>
        {label}
      </Button>
      <span>
        {m.signage_channels_duration_status({
          seconds: slide.duration,
          status: slide.active ? m.signage_channels_active() : m.signage_channels_inactive(),
        })}
      </span>
      <Button
        className="hover:bg-primary"
        disabled={busy || index === 0}
        aria-label={m.signage_channels_up({ name: label })}
        onClick={() => move(index, index - 1)}
      >
        <Icon icon={ChevronUpIcon} />
      </Button>
      <Button
        className="hover:bg-primary"
        disabled={busy || index === count - 1}
        aria-label={m.signage_channels_down({ name: label })}
        onClick={() => move(index, index + 1)}
      >
        <Icon icon={ChevronDownIcon} />
      </Button>
    </li>
  );
}
function Preview({ playlist }: { playlist: Playlist }) {
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(0.3);
  const viewport = useRef<HTMLDivElement>(null);
  const slide = playlist.slides[index % playlist.slides.length];
  useEffect(() => {
    if (!slide) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % playlist.slides.length),
      slide.duration * 1000,
    );
    return () => clearTimeout(timer);
  }, [slide, playlist]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setScale((entry?.contentRect.width ?? 576) / 1920),
    );
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <p role="status">
        {m.signage_channels_total({
          seconds: playlist.slides.reduce((sum, item) => sum + item.duration, 0),
          count: playlist.slides.length,
        })}
      </p>
      {!slide && <p>{m.signage_channels_empty()}</p>}
      <div ref={viewport} className="site-signage-editor-viewport">
        {/* oxlint-disable-next-line shadcn/no-inline-styles -- Scale the shared 1920x1080 canvas to the measured preview width. */}
        <div className="site-signage-editor-canvas" style={{ transform: `scale(${scale})` }}>
          {slide && <SlideRenderer slide={slide} />}
        </div>
      </div>
    </>
  );
}
const newChannel = (): ChannelDraft => ({ name: "", slug: "", edition_id: "", active: false });
export default function SignageChannels({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const client = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelDraft>(newChannel);
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelInitial, setChannelInitial] = useState<ChannelDraft>(newChannel);
  const [previousChannel, setPreviousChannel] = useState<Channel | undefined>();
  const [slideInitial, setSlideInitial] = useState<SlideDraft | null>(null);
  const [slideId, setSlideId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlideDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Playlist | null>(null);
  const [at, setAt] = useState(() => new Date().toISOString());
  const channels = useQuery({
    queryKey: ["admin", "signage", "channels"],
    queryFn: ({ signal }) =>
      signageRequest<Channel[]>("channels", authHeaders(), "GET", undefined, signal),
  });
  const slides = useQuery({
    queryKey: ["admin", "signage", "slides"],
    queryFn: ({ signal }) =>
      signageRequest<Slide[]>("slides", authHeaders(), "GET", undefined, signal),
  });
  const templates = useQuery({
    queryKey: ["admin", "signage", "templates"],
    queryFn: ({ signal }) =>
      signageRequest<Template[]>("templates", authHeaders(), "GET", undefined, signal),
  });
  const editions = useQuery({
    queryKey: ["admin", "signage", "editions"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrowWithUnauthorized<{ id: string; year: number; month: string }[]>(
        "/api/editions",
        { headers: authHeaders(), signal },
        m.admin_error_load_data(),
      ),
  });
  const rows = (slides.data ?? [])
    .filter((item) => item.channel_id === channelId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const kindLabels = {
    organizations: m.signage_editor_organisations(),
    notice: m.signage_editor_notice(),
    image: m.signage_editor_image(),
  };
  const orgLabels = {
    producer: m.admin_item_producer(),
    vendor: m.admin_item_vendor(),
    sponsor: m.admin_item_sponsor(),
  };
  const label = (item: SlideDraft) =>
    item.kind === "organizations" && item.content.organization_type
      ? orgLabels[item.content.organization_type]
      : item.kind === "notice"
        ? item.content.title || item.content.text || kindLabels.notice
        : kindLabels[item.kind];
  const compatible = (templates.data ?? []).filter(
    (item) => !draft || missingBindings(item, draft.kind).length === 0,
  );
  const valid =
    draft && validSlide(draft) && compatible.some((item) => item.id === draft.template_id);
  const channelValid =
    channel.name.trim() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(channel.slug) && channel.edition_id;
  function resetPreview() {
    setPreview(null);
    setStatus("");
  }
  function changeSlide(next: SlideDraft) {
    setDraft(next);
    resetPreview();
  }
  async function run(action: () => Promise<void>, fallback = m.signage_channels_error()) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (cause) {
      setError(signageOperationErrorMessage(cause, fallback));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["admin", "signage"] });
  }
  function selectChannel(item?: Channel) {
    setChannelId(item?.id ?? null);
    setChannel(
      item
        ? { name: item.name, slug: item.slug, edition_id: item.edition_id, active: item.active }
        : newChannel(),
    );
    setDraft(null);
    setSlideId(null);
    setError("");
    resetPreview();
  }
  function openChannel(item?: Channel) {
    setPreviousChannel(channels.data?.find((entry) => entry.id === channelId));
    selectChannel(item);
    setChannelInitial(
      item
        ? { name: item.name, slug: item.slug, edition_id: item.edition_id, active: item.active }
        : newChannel(),
    );
    setChannelOpen(true);
  }
  function closeChannel() {
    setChannelOpen(false);
    selectChannel(previousChannel);
  }
  function closeSlide() {
    setDraft(null);
    setSlideId(null);
    setError("");
    resetPreview();
  }
  function edit(item?: Slide) {
    if (!channelId) return;
    setSlideId(item?.id ?? null);
    const next = item
      ? { ...item, content: { ...item.content } }
      : emptySlide(channelId, rows.length);
    setDraft(next);
    setSlideInitial(next);
    setError("");
    resetPreview();
  }
  function move(from: number, to: number) {
    void run(async () => {
      await signageRequest(`channels/${channelId}/reorder`, authHeaders(), "POST", {
        ordered_ids: moveSlide(rows, from, to).map((item) => item.id),
      });
      setDraft(null);
      resetPreview();
      await refresh();
    });
  }
  async function confirmRemove(resource: "channels" | "slides", id: string) {
    if (
      await confirm({
        title:
          resource === "channels" ? m.signage_channels_delete() : m.signage_channels_delete_slide(),
        body: m.signage_channels_delete_confirm(),
        errorFallback: m.signage_channels_error(),
      })
    )
      await run(() => remove(resource, id));
  }
  async function remove(resource: "channels" | "slides", id: string) {
    await fetchVoidOrThrowWithUnauthorized(
      `/api/signage/${resource}/${id}`,
      { method: "DELETE", headers: authHeaders() },
      m.signage_channels_error(),
    );
    if (resource === "channels") selectChannel();
    else {
      setDraft(null);
      resetPreview();
    }
    await refresh();
  }
  const previewControls = (
    <>
      <Field label={m.signage_channels_preview_time()}>
        <AdminInput
          type="datetime-local"
          required
          value={localSchedule(at)}
          onChange={(e) => {
            if (e.target.value) setAt(new Date(e.target.value).toISOString());
            resetPreview();
          }}
        />
      </Field>
      <Button
        className="hover:bg-primary"
        disabled={!channelValid || Boolean(draft && !valid)}
        onClick={() =>
          void run(async () => {
            const items: SlideDraft[] = rows
              .filter((item) => item.id !== slideId || !draft)
              .map(({ id: _id, ...item }) => item);
            if (draft) {
              const { id: _id, ...item } = { ...draft, id: slideId };
              items.push(item);
            }
            setPreview(
              await signageRequest<Playlist>(
                `preview?locale=${getLocale()}`,
                authHeaders(),
                "POST",
                { channel, slides: items, at },
              ),
            );
          })
        }
      >
        {m.signage_channels_preview()}
      </Button>
      <p>{m.signage_channels_preview_help()}</p>
      {channelId && (
        <a
          href={`/signage/${channels.data?.find((item) => item.id === channelId)?.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          {m.signage_channels_test()}
        </a>
      )}
      {preview && <Preview key={preview.revision} playlist={preview} />}
    </>
  );
  const queryError = channels.error || slides.error || templates.error || editions.error;
  return (
    <div className="space-y-4 text-content">
      {confirmDialog}
      <h2 className="text-xl font-semibold">{m.signage_channels_heading()}</h2>
      {!channelOpen && !draft && (error || queryError) && (
        <Alert variant="danger" role="alert">
          {error || apiErrorMessage(queryError, m.admin_error_load_data())}
        </Alert>
      )}
      {status && <p role="status">{status}</p>}
      <SignageVideoExports channels={channels.data ?? []} authHeaders={authHeaders} />
      <fieldset disabled={busy} className="space-y-4">
        <Button className="hover:bg-primary" onClick={() => openChannel()}>
          {m.signage_channels_new()}
        </Button>
        <ul className="space-y-2">
          {channels.data?.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <Button
                variant={channelId === item.id ? "default" : "outline"}
                aria-pressed={channelId === item.id}
                onClick={() => selectChannel(item)}
              >
                {item.name}
              </Button>
              <Button variant="outline" onClick={() => openChannel(item)}>
                {m.admin_edit_item({ name: item.name })}
              </Button>
              <span>
                {item.active ? m.signage_channels_active() : m.signage_channels_inactive()}
              </span>
              <a href={channelPath(item.slug)} target="_blank" rel="noreferrer">
                {channelPath(item.slug)}
              </a>
              <Button
                className="hover:bg-primary"
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(`${location.origin}/signage/${item.slug}`);
                    setStatus(m.signage_channels_copied());
                  })
                }
              >
                {m.signage_channels_copy({ name: item.name })}
              </Button>
              {[true, false].map((bundle) => (
                <Button
                  key={String(bundle)}
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      const playlist = await fetchJsonOrThrowWithUnauthorized<Playlist>(
                        `/api/signage/${encodeURIComponent(item.slug)}/playlist?locale=${getLocale()}`,
                        { headers: authHeaders() },
                        m.signage_export_error(),
                      );
                      const { downloadExport } = await import("@/signage/export");
                      await downloadExport(playlist, item.slug, bundle, {
                        start: m.signage_start(),
                        setup: m.signage_export_setup(),
                      });
                      setStatus(m.signage_export_done());
                    }, m.signage_export_error())
                  }
                >
                  {bundle ? m.signage_export_bundle() : m.signage_export_images()}
                </Button>
              ))}
            </li>
          ))}
        </ul>
        {channelOpen && (
          <AdminEditorDialog
            title={
              channelId
                ? m.admin_edit_item({ name: channelInitial.name })
                : m.signage_channels_new()
            }
            busy={busy}
            dirty={JSON.stringify(channel) !== JSON.stringify(channelInitial)}
            onClose={closeChannel}
            footer={
              <Button form="signage-channel-form" type="submit" disabled={busy || !channelValid}>
                {m.signage_channels_save()}
              </Button>
            }
          >
            {(error || queryError) && (
              <Alert variant="danger">
                {error || apiErrorMessage(queryError, m.admin_error_load_data())}
              </Alert>
            )}
            <fieldset disabled={busy} className="space-y-4">
              <form
                id="signage-channel-form"
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!channelValid) return;
                  void run(async () => {
                    const saved = await signageRequest<Channel>(
                      `channels${channelId ? `/${channelId}` : ""}`,
                      authHeaders(),
                      channelId ? "PUT" : "POST",
                      channel,
                    );
                    setChannelId(saved.id);
                    setChannelOpen(false);
                    await refresh();
                    setStatus(m.signage_channels_saved());
                  });
                }}
              >
                <Field label={m.signage_editor_name()}>
                  <AdminInput
                    required
                    maxLength={200}
                    value={channel.name}
                    onChange={(e) => {
                      setChannel({ ...channel, name: e.target.value });
                      resetPreview();
                    }}
                  />
                </Field>
                <Field label={m.signage_channels_slug()}>
                  <AdminInput
                    required
                    maxLength={100}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={channel.slug}
                    onChange={(e) => {
                      setChannel({ ...channel, slug: e.target.value });
                      resetPreview();
                    }}
                  />
                </Field>
                <Field label={m.signage_channels_edition()}>
                  <AdminSelect
                    value={channel.edition_id}
                    onValueChange={(value) => {
                      setChannel({ ...channel, edition_id: value ?? "" });
                      resetPreview();
                    }}
                  >
                    <AdminOption value="">—</AdminOption>
                    {editions.data?.map((item) => (
                      <AdminOption key={item.id} value={item.id}>
                        {item.year} · {item.month}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                </Field>
                <AdminCheck
                  label={m.signage_channels_active()}
                  checked={channel.active}
                  onCheckedChange={(checked) => {
                    setChannel({ ...channel, active: checked });
                    resetPreview();
                  }}
                />
              </form>
              {previewControls}
            </fieldset>
          </AdminEditorDialog>
        )}
        {channelId && (
          <>
            <h3>
              {channel.name} · {m.signage_channels_playlist()}
            </h3>
            <Button className="hover:bg-primary" onClick={() => edit()}>
              {m.signage_channels_add()}
            </Button>
            <DragDropProvider
              onDragEnd={(event) => {
                if (!event.canceled && isSortable(event.operation.source)) {
                  const source = event.operation.source;
                  if (source.initialIndex !== source.index) move(source.initialIndex, source.index);
                }
              }}
            >
              <ul className="space-y-2">
                {rows.map((item, index) => (
                  <Row
                    key={item.id}
                    slide={item}
                    index={index}
                    count={rows.length}
                    busy={busy}
                    label={label(item)}
                    edit={() => edit(item)}
                    move={move}
                  />
                ))}
              </ul>
            </DragDropProvider>
          </>
        )}
        {draft && (
          <AdminEditorDialog
            title={slideId ? m.signage_edit_slide() : m.signage_channels_add()}
            busy={busy}
            dirty={JSON.stringify(draft) !== JSON.stringify(slideInitial)}
            onClose={closeSlide}
            footer={
              <>
                {slideId && (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void confirmRemove("slides", slideId)}
                  >
                    {m.signage_channels_delete_slide()}
                  </Button>
                )}
                <Button form="signage-slide-form" type="submit" disabled={busy || !valid}>
                  {m.signage_channels_save_slide()}
                </Button>
              </>
            }
          >
            {(error || queryError) && (
              <Alert variant="danger">
                {error || apiErrorMessage(queryError, m.admin_error_load_data())}
              </Alert>
            )}
            <fieldset disabled={busy} className="space-y-4">
              <form
                id="signage-slide-form"
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!valid) return;
                  void run(async () => {
                    const { id: _id, ...body } = { ...draft, id: slideId };
                    await signageRequest(
                      `slides${slideId ? `/${slideId}` : ""}`,
                      authHeaders(),
                      slideId ? "PUT" : "POST",
                      body,
                    );
                    setDraft(null);
                    resetPreview();
                    await refresh();
                    setStatus(m.signage_channels_saved());
                  });
                }}
              >
                <Field label={m.signage_editor_kind()}>
                  <AdminSelect
                    value={draft.kind}
                    onValueChange={(value) =>
                      changeSlide({ ...draft, kind: value as SlideDraft["kind"], template_id: "" })
                    }
                  >
                    {Object.entries(kindLabels).map(([key, text]) => (
                      <AdminOption key={key} value={key}>
                        {text}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                </Field>
                {draft.kind === "organizations" && (
                  <Field label={m.signage_channels_group()}>
                    <AdminSelect
                      value={draft.content.organization_type ?? ""}
                      onValueChange={(value) =>
                        changeSlide({
                          ...draft,
                          content: {
                            ...draft.content,
                            organization_type: (value as "producer" | "vendor" | "sponsor") || null,
                          },
                        })
                      }
                    >
                      <AdminOption value="">{m.signage_channels_all()}</AdminOption>
                      {Object.entries(orgLabels).map(([key, text]) => (
                        <AdminOption key={key} value={key}>
                          {text}
                        </AdminOption>
                      ))}
                    </AdminSelect>
                  </Field>
                )}
                <Field label={m.signage_channels_template()}>
                  <AdminSelect
                    value={draft.template_id}
                    onValueChange={(value) => changeSlide({ ...draft, template_id: value ?? "" })}
                  >
                    <AdminOption value="">—</AdminOption>
                    {compatible.map((item) => (
                      <AdminOption key={item.id} value={item.id}>
                        {item.name}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                </Field>
                <p>{m.signage_channels_templates_help()}</p>
                <Field label={m.signage_channels_duration()}>
                  <AdminInput
                    required
                    type="number"
                    min={1}
                    max={3600}
                    step={1}
                    value={draft.duration}
                    onChange={(e) => changeSlide({ ...draft, duration: Number(e.target.value) })}
                  />
                </Field>
                <AdminCheck
                  label={m.signage_channels_slide_active()}
                  checked={draft.active}
                  onCheckedChange={(checked) => changeSlide({ ...draft, active: checked })}
                />
                {(["starts_at", "ends_at"] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      key === "starts_at" ? m.signage_channels_start() : m.signage_channels_end()
                    }
                  >
                    <AdminInput
                      type="datetime-local"
                      value={localSchedule(draft[key])}
                      onChange={(e) =>
                        changeSlide({
                          ...draft,
                          [key]: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                    />
                  </Field>
                ))}
                {draft.kind === "notice" && (
                  <>
                    <Field label={m.signage_editor_title()}>
                      <AdminInput
                        maxLength={120}
                        value={draft.content.title ?? ""}
                        onChange={(e) =>
                          changeSlide({
                            ...draft,
                            content: { ...draft.content, title: e.target.value || null },
                          })
                        }
                      />
                    </Field>
                    <Field label={m.signage_editor_text()}>
                      <AdminTextarea
                        maxLength={500}
                        required
                        value={draft.content.text ?? ""}
                        onChange={(e) =>
                          changeSlide({
                            ...draft,
                            content: { ...draft.content, text: e.target.value || null },
                          })
                        }
                      />
                    </Field>
                    <Field label={m.signage_editor_icon()}>
                      <AdminSelect
                        value={draft.content.icon ?? ""}
                        onValueChange={(value) =>
                          changeSlide({
                            ...draft,
                            content: { ...draft.content, icon: value || null },
                          })
                        }
                      >
                        <AdminOption value="">—</AdminOption>
                        {Object.keys(signageIcons).map((icon) => (
                          <AdminOption key={icon} value={icon}>
                            {icon}
                          </AdminOption>
                        ))}
                      </AdminSelect>
                    </Field>
                  </>
                )}
                {draft.kind === "image" && (
                  <Field label={m.signage_editor_upload()}>
                    <AdminInput
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void run(async () => {
                          const data = new FormData();
                          data.append("file", file);
                          const headers = { ...authHeaders() };
                          delete headers["Content-Type"];
                          const result = await fetchJsonOrThrowWithUnauthorized<{ url: string }>(
                            "/api/signage/assets",
                            { method: "POST", headers, body: data },
                            m.signage_channels_error(),
                          );
                          changeSlide({
                            ...draft,
                            content: { ...draft.content, image: result.url },
                          });
                        });
                      }}
                    />
                  </Field>
                )}
              </form>
              {previewControls}
            </fieldset>
          </AdminEditorDialog>
        )}
        {channelId && !draft && !channelOpen && previewControls}
        {channelId && (
          <Button
            variant="destructive"
            className="text-content"
            onClick={() => {
              void confirmRemove("channels", channelId);
            }}
          >
            {m.signage_channels_delete()}
          </Button>
        )}
      </fieldset>
    </div>
  );
}
