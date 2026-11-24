import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  signageRequest,
  signageOperationErrorMessage,
  fetchJsonOrThrow,
  fetchVoidOrThrow,
} from "@/lib/api/adminApi";
import { m } from "@/paraglide/messages";
import { missingBindings, type Template } from "../editorModel";
import {
  emptySlide,
  validSlide,
  moveSlide,
  type Channel,
  type ChannelDraft,
  type Slide,
  type SlideDraft,
} from "../playlistModel";
import type { Playlist } from "../types";

export const channelPath = (slug: string) => `/signage/${slug}`;

const newChannel = (): ChannelDraft => ({ name: "", slug: "", edition_id: "", active: false });

/** Everything the signage channels screen shares: queries, selection, drafts and the save/move/remove flows. */
export function useSignageChannelsEditor() {
  const client = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const requestedChannelId =
    typeof search.signageChannel === "string" ? search.signageChannel : null;
  const setChannelId = (id: string | null) => {
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        signageChannel: id ?? undefined,
      }),
    });
  };
  const [channel, setChannel] = useState<ChannelDraft>(newChannel);
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelInitial, setChannelInitial] = useState<ChannelDraft>(newChannel);
  const [previousChannel, setPreviousChannel] = useState<Channel | undefined>();
  const [slideInitial, setSlideInitial] = useState<SlideDraft | null>(null);
  const [slideId, setSlideId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlideDraft | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Playlist | null>(null);
  const [at, setAt] = useState(() => new Date().toISOString());
  const channels = useQuery({
    queryKey: ["admin", "signage", "channels"],
    queryFn: ({ signal }) => signageRequest<Channel[]>("channels", "GET", undefined, signal),
  });
  const channelId = channels.data?.some((item) => item.id === requestedChannelId)
    ? requestedChannelId
    : null;
  // The selected channel lives in the URL, so a reload, shared link or history navigation can
  // change it without `selectChannel` running. When the draft does not already describe the
  // selected channel, adopt the loaded channel and drop the previous one's slide, error and
  // preview state during render. Selecting or saving a channel already sets the draft, so those
  // keep their status message. Never run while the channel dialog is open: that would discard
  // the user's edits.
  const [syncedChannelId, setSyncedChannelId] = useState<string | null>(null);
  if (!channelOpen && channelId !== syncedChannelId) {
    const selected = channels.data?.find((item) => item.id === channelId);
    const target = selected
      ? {
          name: selected.name,
          slug: selected.slug,
          edition_id: selected.edition_id,
          active: selected.active,
        }
      : newChannel();
    setSyncedChannelId(channelId);
    if (JSON.stringify(channel) !== JSON.stringify(target)) {
      setChannel(target);
      setDraft(null);
      setCreatingTemplate(false);
      setSlideId(null);
      setError("");
      resetPreview();
    }
  }
  const slides = useQuery({
    queryKey: ["admin", "signage", "slides"],
    queryFn: ({ signal }) => signageRequest<Slide[]>("slides", "GET", undefined, signal),
  });
  const templates = useQuery({
    queryKey: ["admin", "signage", "templates"],
    queryFn: ({ signal }) => signageRequest<Template[]>("templates", "GET", undefined, signal),
  });
  const editions = useQuery({
    queryKey: ["admin", "signage", "editions"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrow<{ id: string; edition_type: string; year: number; month: string }[]>(
        "/api/editions",
        { signal },
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
    setCreatingTemplate(false);
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
      await signageRequest(`channels/${channelId}/reorder`, "POST", {
        ordered_ids: moveSlide(rows, from, to).map((item) => item.id),
      });
      setDraft(null);
      resetPreview();
      await refresh();
    });
  }
  async function confirmRemove(resource: "channels" | "slides", id: string, name: string) {
    if (
      await confirm({
        title:
          resource === "channels" ? m.signage_channels_delete() : m.signage_channels_delete_slide(),
        body:
          resource === "channels"
            ? m.signage_channels_delete_confirm({ name })
            : m.signage_channels_delete_slide_confirm({ name }),
        confirmLabel: m.admin_delete(),
        errorFallback: m.signage_channels_error(),
      })
    )
      await run(() => remove(resource, id));
  }
  async function remove(resource: "channels" | "slides", id: string) {
    await fetchVoidOrThrow(
      `/api/signage/${resource}/${id}`,
      { method: "DELETE" },
      m.signage_channels_error(),
    );
    if (resource === "channels") selectChannel();
    else {
      setDraft(null);
      resetPreview();
    }
    await refresh();
  }
  const queryError = channels.error || slides.error || templates.error || editions.error;

  return {
    client,
    search,
    navigate,
    requestedChannelId,
    setChannelId,
    channels,
    channelId,
    slides,
    templates,
    editions,
    rows,
    kindLabels,
    orgLabels,
    label,
    compatible,
    valid,
    channelValid,
    resetPreview,
    changeSlide,
    run,
    refresh,
    selectChannel,
    openChannel,
    closeChannel,
    closeSlide,
    edit,
    move,
    confirmRemove,
    remove,
    queryError,
    channel,
    setChannel,
    channelOpen,
    setChannelOpen,
    channelInitial,
    setChannelInitial,
    previousChannel,
    setPreviousChannel,
    slideInitial,
    setSlideInitial,
    slideId,
    setSlideId,
    draft,
    setDraft,
    creatingTemplate,
    setCreatingTemplate,
    busy,
    setBusy,
    error,
    setError,
    status,
    setStatus,
    preview,
    setPreview,
    at,
    setAt,
    syncedChannelId,
    setSyncedChannelId,
    confirm,
    confirmDialog,
  };
}

export type SignageChannelsEditor = ReturnType<typeof useSignageChannelsEditor>;
