import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AdminInput, AdminSelect, AdminOption, AdminCheck } from "@/components/admin/AdminFields";
import { signageRequest } from "@/lib/api/adminApi";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { m } from "@/paraglide/messages";
import { type Channel } from "../playlistModel";
import AdminEditorDialog from "@/components/admin/AdminEditorDialog";
import { editionDisplayNameWithType } from "@/lib/editions/editionName";
import { type SignageChannelsEditor } from "./useSignageChannelsEditor";
import { Field } from "./ChannelParts";
import { PreviewControls } from "./PreviewControls";

interface ChannelDialogProps {
  editor: SignageChannelsEditor;
}

/** The add/edit channel dialog. */
export function ChannelDialog({ editor }: ChannelDialogProps) {
  const {
    setChannelId,
    channelId,
    editions,
    channelValid,
    resetPreview,
    run,
    refresh,
    closeChannel,
    queryError,
    channel,
    setChannel,
    setChannelOpen,
    channelInitial,
    busy,
    error,
    setStatus,
  } = editor;
  return (
    <AdminEditorDialog
      title={
        channelId ? m.admin_edit_item({ name: channelInitial.name }) : m.signage_channels_new()
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
          <p>{m.signage_channel_requirements()}</p>
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
              required
              value={channel.edition_id}
              onValueChange={(value) => {
                setChannel({ ...channel, edition_id: value ?? "" });
                resetPreview();
              }}
            >
              <AdminOption value="">—</AdminOption>
              {editions.data?.map((item) => (
                <AdminOption key={item.id} value={item.id}>
                  {editionDisplayNameWithType({
                    edition_type: item.edition_type,
                    year: item.year,
                    month: item.month,
                  })}
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
        <PreviewControls editor={editor} />
      </fieldset>
    </AdminEditorDialog>
  );
}
