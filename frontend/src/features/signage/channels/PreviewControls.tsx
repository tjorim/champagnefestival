import { Button } from "@/components/ui/button";
import { AdminInput } from "@/components/admin/AdminFields";
import { signageRequest } from "@/lib/api/adminApi";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { localSchedule, type SlideDraft } from "../playlistModel";
import type { Playlist } from "../types";
import { type SignageChannelsEditor } from "./useSignageChannelsEditor";
import { Field, Preview } from "./ChannelParts";

interface PreviewControlsProps {
  editor: SignageChannelsEditor;
}

/** The preview time picker, refresh action and the rendered preview of the channel. */
export function PreviewControls({ editor }: PreviewControlsProps) {
  const {
    channels,
    channelId,
    rows,
    valid,
    channelValid,
    resetPreview,
    run,
    channel,
    slideId,
    draft,
    preview,
    setPreview,
    at,
    setAt,
  } = editor;
  return (
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
      {(!channelValid || Boolean(draft && !valid)) && (
        <p role="status">
          {!channelValid ? m.signage_channel_requirements() : m.signage_slide_requirements()}
        </p>
      )}
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
}
