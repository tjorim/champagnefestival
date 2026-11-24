import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { m } from "@/paraglide/messages";
import SignageVideoExports from "./SignageVideoExports";
import { useSignageChannelsEditor } from "./channels/useSignageChannelsEditor";
import { PreviewControls } from "./channels/PreviewControls";
import { ChannelList } from "./channels/ChannelList";
import { ChannelDialog } from "./channels/ChannelDialog";
import { PlaylistSection } from "./channels/PlaylistSection";
import { SlideDialog } from "./channels/SlideDialog";
import "./editor.css";

export default function SignageChannels() {
  const editor = useSignageChannelsEditor();
  const {
    channels,
    channelId,
    confirmRemove,
    queryError,
    channel,
    channelOpen,
    draft,
    busy,
    error,
    status,
    confirmDialog,
  } = editor;

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
      <SignageVideoExports channels={channels.data ?? []} />
      <fieldset disabled={busy} className="space-y-4">
        <ChannelList editor={editor} />
        {channelOpen && <ChannelDialog editor={editor} />}
        {channelId && <PlaylistSection editor={editor} />}
        {draft && <SlideDialog editor={editor} />}
        {channelId && !draft && !channelOpen && <PreviewControls editor={editor} />}
        {channelId && (
          <Button
            variant="destructive"
            className="text-content"
            onClick={() => {
              void confirmRemove("channels", channelId, channel.name);
            }}
          >
            {m.signage_channels_delete()}
          </Button>
        )}
      </fieldset>
    </div>
  );
}
