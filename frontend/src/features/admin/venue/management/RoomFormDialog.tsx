import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { useCallback, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Room, RoomUpdate, Venue } from "@/api-types";

// widthM/lengthM start blank — a room's real dimensions have no defensible
// generic default (see #833/#835), so the admin must enter them deliberately
// rather than accidentally saving a made-up size.
const emptyRoomForm: {
  venueId: string;
  name: string;
  widthM: number | "";
  lengthM: number | "";
  color: string;
} = { venueId: "", name: "", widthM: "", lengthM: "", color: "#ffc107" };

// venueId starts blank (filled from the venue row the admin clicked "+" on) and
// widthM/lengthM start blank — a table type belongs to exactly one venue (like a
// room, see #858) and its real dimensions have no defensible generic default

interface RoomFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingId: string | null;
  editingRoom: Room | null;
  /** The venue a new room is added under (ignored while editing). */
  addVenueId: string | null;
  venues: Venue[];
  error: string | null;
  onError: (message: string | null) => void;
  onAddRoom: (
    venueId: string,
    name: string,
    widthM: number,
    lengthM: number,
    color: string,
  ) => Promise<void>;
  onUpdateRoom: (roomId: string, data: RoomUpdate) => Promise<void>;
}

export function RoomFormDialog({
  open: showRoomModal,
  onClose,
  editingId: editingRoomId,
  editingRoom,
  addVenueId: addRoomVenueId,
  venues,
  error: addRoomError,
  onError: setAddRoomError,
  onAddRoom,
  onUpdateRoom,
}: RoomFormDialogProps) {
  // Derived rather than a static template — see `venueDefaultValues` above.
  const roomDefaultValues = useMemo(
    () =>
      editingRoom
        ? {
            venueId: editingRoom.venue_id,
            name: editingRoom.name,
            widthM: editingRoom.width_m,
            lengthM: editingRoom.length_m,
            color: editingRoom.color,
          }
        : { ...emptyRoomForm, venueId: addRoomVenueId ?? "" },
    [editingRoom, addRoomVenueId],
  );

  const roomForm = useForm({
    defaultValues: roomDefaultValues,
    onSubmit: async ({ value }) => {
      if (
        !isRoomFormValid() ||
        typeof value.widthM !== "number" ||
        typeof value.lengthM !== "number"
      ) {
        return;
      }
      setAddRoomError(null);
      try {
        if (editingRoomId) {
          // Omit widthM/lengthM entirely when they match the room's current (live) values —
          // the backend clears a room's `dimensionsPlaceholder` flag whenever either field
          // is present in the update, so sending them unchanged on an unrelated edit (e.g.
          // renaming or recolouring) would wrongly mark an unverified legacy 20x15 room as
          // a confirmed, measured one. Compared against the live `editingRoom` record
          // (rather than a snapshot frozen when the modal opened) so a background refetch
          // that updates both the form's defaults and this comparison in lockstep can't
          // make an untouched save look like a dimension change.
          const dimensionsChanged =
            editingRoom === null ||
            editingRoom.width_m !== value.widthM ||
            editingRoom.length_m !== value.lengthM;
          await onUpdateRoom(editingRoomId, {
            venue_id: value.venueId,
            name: value.name.trim(),
            ...(dimensionsChanged ? { width_m: value.widthM, length_m: value.lengthM } : {}),
            color: value.color,
          });
        } else {
          await onAddRoom(
            value.venueId,
            value.name.trim(),
            value.widthM,
            value.lengthM,
            value.color,
          );
        }
        onClose();
      } catch (err) {
        setAddRoomError(apiErrorMessage(err, m.admin_content_error_save()));
      }
    },
  });
  const roomValues = useSelector(roomForm.atom, (s) => s.values);

  const isRoomFormValid = useCallback(
    () =>
      Boolean(roomValues.venueId) &&
      roomValues.name.trim().length > 0 &&
      typeof roomValues.widthM === "number" &&
      roomValues.widthM >= 1 &&
      typeof roomValues.lengthM === "number" &&
      roomValues.lengthM >= 1,
    [roomValues],
  );

  // Seed the form when the modal opens — see the venue modal's equivalent block.
  const [wasRoomModalShown, setWasRoomModalShown] = useState(showRoomModal);
  if (showRoomModal !== wasRoomModalShown) {
    setWasRoomModalShown(showRoomModal);
    if (showRoomModal) roomForm.reset(roomDefaultValues);
  }

  const handleSaveRoom = () => {
    void roomForm.handleSubmit();
  };

  return (
    <Dialog
      open={showRoomModal}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle id="room-modal-title">
            {editingRoomId ? m.admin_edit_room() : m.admin_room_add()}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {addRoomError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mb-4 text-sm"
            >
              {addRoomError}
            </Alert>
          )}
          <AdminField className="mb-4" controlId="room-venue">
            <AdminLabel>{m.admin_room_venue_label()}</AdminLabel>
            <roomForm.Field name="venueId">
              {(field) => (
                <AdminSelect
                  value={field.value}
                  onValueChange={(e) => field.handleChange(e)}
                  onBlur={field.handleBlur}
                  className={ADMIN_CONTROL_CLASS}
                >
                  {venues
                    .filter((v) => v.active)
                    .map((v) => (
                      <AdminOption key={v.id} value={v.id}>
                        {v.name}
                      </AdminOption>
                    ))}
                </AdminSelect>
              )}
            </roomForm.Field>
          </AdminField>
          <AdminField className="mb-4" controlId="room-name">
            <AdminLabel>{m.admin_room_name_label()}</AdminLabel>
            <roomForm.Field name="name">
              {(field) => (
                <AdminInput
                  type="text"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className={ADMIN_CONTROL_CLASS}
                  placeholder={m.admin_room_name_placeholder()}
                />
              )}
            </roomForm.Field>
          </AdminField>
          <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2 mb-4">
            <div className="min-w-0 flex-1">
              <AdminField controlId="room-width">
                <AdminLabel>{m.admin_room_width_label()}</AdminLabel>
                <roomForm.Field name="widthM">
                  {(field) => (
                    <AdminInput
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={field.value}
                      onChange={(e) =>
                        field.handleChange(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      onBlur={field.handleBlur}
                      className={ADMIN_CONTROL_CLASS}
                    />
                  )}
                </roomForm.Field>
              </AdminField>
            </div>
            <div className="min-w-0 flex-1">
              <AdminField controlId="room-length">
                <AdminLabel>{m.admin_room_length_label()}</AdminLabel>
                <roomForm.Field name="lengthM">
                  {(field) => (
                    <AdminInput
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={field.value}
                      onChange={(e) =>
                        field.handleChange(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      onBlur={field.handleBlur}
                      className={ADMIN_CONTROL_CLASS}
                    />
                  )}
                </roomForm.Field>
              </AdminField>
            </div>
          </div>
          <AdminField controlId="room-color">
            <AdminLabel>{m.admin_room_color_label()}</AdminLabel>
            <roomForm.Field name="color">
              {(field) => (
                <div className="flex gap-2 items-center">
                  <AdminInput
                    type="color"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="w-12 h-9.5 p-0.5"
                  />
                  <AdminInput
                    type="text"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="bg-muted text-content border-input font-mono"
                  />
                </div>
              )}
            </roomForm.Field>
          </AdminField>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose()}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="warning" onClick={handleSaveRoom} disabled={!isRoomFormValid()}>
            {m.admin_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
