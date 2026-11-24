import { LinkIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Playlist } from "../types";
import { AdminAddButton, RowActionButton, RowActions } from "@/components/admin/RowActions";
import { type SignageChannelsEditor, channelPath } from "./useSignageChannelsEditor";

interface ChannelListProps {
  editor: SignageChannelsEditor;
}

/** The channel list with its add button. */
export function ChannelList({ editor }: ChannelListProps) {
  const { channels, channelId, run, selectChannel, openChannel, setStatus } = editor;
  return (
    <>
      <AdminAddButton onClick={() => openChannel()}>{m.signage_channels_new()}</AdminAddButton>
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
            <RowActions>
              <RowActionButton
                icon={PencilIcon}
                label={m.admin_edit_item({ name: item.name })}
                onClick={() => openChannel(item)}
              />
              <RowActionButton
                icon={LinkIcon}
                label={m.signage_channels_copy({ name: item.name })}
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(`${location.origin}/signage/${item.slug}`);
                    setStatus(m.signage_channels_copied());
                  })
                }
              />
            </RowActions>
            <span>{item.active ? m.signage_channels_active() : m.signage_channels_inactive()}</span>
            <a href={channelPath(item.slug)} target="_blank" rel="noreferrer">
              {channelPath(item.slug)}
            </a>
            {[true, false].map((bundle) => (
              <Button
                key={String(bundle)}
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    const playlist = await fetchJsonOrThrow<Playlist>(
                      `/api/signage/${encodeURIComponent(item.slug)}/playlist?locale=${getLocale()}`,
                      {},
                      m.signage_export_error(),
                    );
                    const { downloadExport } = await import("../export");
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
    </>
  );
}
