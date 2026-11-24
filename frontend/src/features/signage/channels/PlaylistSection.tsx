import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { m } from "@/paraglide/messages";
import { AdminAddButton } from "@/components/admin/RowActions";
import { type SignageChannelsEditor } from "./useSignageChannelsEditor";
import { Row } from "./ChannelParts";

interface PlaylistSectionProps {
  editor: SignageChannelsEditor;
}

/** The playlist of the selected channel: add slide button and the sortable slide rows. */
export function PlaylistSection({ editor }: PlaylistSectionProps) {
  const { rows, label, edit, move, channel, busy } = editor;
  const channelId = editor.channelId;
  if (!channelId) return null;
  return (
    <>
      <h3>
        {channel.name} · {m.signage_channels_playlist()}
      </h3>
      <AdminAddButton onClick={() => edit()}>{m.signage_channels_add()}</AdminAddButton>
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
  );
}
