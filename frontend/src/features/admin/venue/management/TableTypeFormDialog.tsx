import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
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
import type {
  FloorTable,
  Layout,
  TableType,
  TableTypeCreate,
  TableTypeUpdate,
  Venue,
} from "@/api-types";
import ConfirmModal from "@/components/ConfirmModal";

const emptyTableTypeForm: {
  venueId: string;
  name: string;
  shape: "rectangle" | "round";
  widthM: number | "";
  lengthM: number | "";
  heightType: "low" | "high";
  capacity: number;
  active: boolean;
} = {
  venueId: "",
  name: "",
  shape: "rectangle",
  widthM: "",
  lengthM: "",
  heightType: "low",
  capacity: 4,
  active: true,
};

interface TableTypeFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingId: string | null;
  editingTableType: TableType | null;
  /** The venue a new table type is added under (ignored while editing). */
  addVenueId: string | null;
  venues: Venue[];
  tables: FloorTable[];
  layouts: Layout[];
  error: string | null;
  onError: (message: string | null) => void;
  onAddTableType: (data: TableTypeCreate) => Promise<void>;
  onUpdateTableType: (id: string, data: TableTypeUpdate) => Promise<void>;
}

export function TableTypeFormDialog({
  open: showTableTypeModal,
  onClose,
  editingId: editingTableTypeId,
  editingTableType,
  addVenueId: addTableTypeVenueId,
  venues,
  tables,
  layouts,
  error: addTableTypeError,
  onError: setAddTableTypeError,
  onAddTableType,
  onUpdateTableType,
}: TableTypeFormDialogProps) {
  const [tableTypeDimensionConfirm, setTableTypeDimensionConfirm] = useState<{
    tableCount: number;
    roomCount: number;
    payload: typeof emptyTableTypeForm & { widthM: number; lengthM: number };
    editingId: string;
  } | null>(null);
  // Derived rather than a static template — see `venueDefaultValues` above.
  const tableTypeDefaultValues = useMemo(
    () =>
      editingTableType
        ? {
            venueId: editingTableType.venue_id,
            name: editingTableType.name,
            shape: editingTableType.shape,
            widthM: editingTableType.width_m,
            lengthM: editingTableType.length_m,
            heightType: editingTableType.height_type,
            capacity: editingTableType.capacity,
            active: editingTableType.active,
          }
        : { ...emptyTableTypeForm, venueId: addTableTypeVenueId ?? "" },
    [editingTableType, addTableTypeVenueId],
  );

  const tableTypeForm = useForm({
    defaultValues: tableTypeDefaultValues,
    onSubmit: async ({ value }) => {
      // Every rejected input needs to say why — bailing silently leaves the Save
      // button looking broken.
      if (!value.name.trim()) {
        setAddTableTypeError(m.admin_table_type_name_required());
        return;
      }
      if (!value.venueId) {
        setAddTableTypeError(m.admin_table_type_venue_required());
        return;
      }
      if (value.capacity < 1 || !Number.isInteger(value.capacity)) {
        setAddTableTypeError(m.admin_table_type_capacity_min());
        return;
      }
      const { widthM, lengthM } = value;
      if (
        typeof widthM !== "number" ||
        widthM <= 0 ||
        typeof lengthM !== "number" ||
        lengthM <= 0
      ) {
        setAddTableTypeError(m.admin_table_type_dimensions_positive());
        return;
      }
      const payload = { ...value, widthM, lengthM };
      // Tables render by joining live against TableType rather than a dimension
      // snapshot taken at placement time, so a shape/dimension change here silently
      // redraws every table of this type on every layout that ever placed one —
      // including past editions (#858). Surface the blast radius and let the admin
      // back out before that happens; a name/capacity/venue-only edit is unaffected.
      if (
        editingTableTypeId &&
        editingTableType &&
        (value.shape !== editingTableType.shape ||
          widthM !== editingTableType.width_m ||
          lengthM !== editingTableType.length_m)
      ) {
        const affectedTableLayoutIds = tables
          .filter((t) => t.table_type_id === editingTableTypeId)
          .map((t) => t.layout_id);
        const affectedRoomIds = new Set(
          affectedTableLayoutIds
            .map((layoutId) => layouts.find((l) => l.id === layoutId)?.room_id)
            .filter((roomId): roomId is string => Boolean(roomId)),
        );
        if (affectedTableLayoutIds.length > 0) {
          setTableTypeDimensionConfirm({
            tableCount: affectedTableLayoutIds.length,
            roomCount: affectedRoomIds.size,
            payload,
            editingId: editingTableTypeId,
          });
          return;
        }
      }
      setAddTableTypeError(null);
      try {
        await commitSaveTableType(payload, editingTableTypeId);
      } catch (err) {
        setAddTableTypeError(apiErrorMessage(err, m.admin_content_error_save()));
      }
    },
  });
  const tableTypeValues = useSelector(tableTypeForm.atom, (s) => s.values);

  const commitSaveTableType = async (
    payload: typeof emptyTableTypeForm & { widthM: number; lengthM: number },
    editingId: string | null,
  ) => {
    const body: TableTypeCreate = {
      name: payload.name,
      venue_id: payload.venueId,
      shape: payload.shape,
      width_m: payload.widthM,
      length_m: payload.lengthM,
      height_type: payload.heightType,
      capacity: payload.capacity,
    };
    if (editingId) {
      await onUpdateTableType(editingId, body);
    } else {
      await onAddTableType(body);
    }
    onClose();
  };

  // Seed the form when the modal opens — see the venue modal's equivalent block.
  const [wasTableTypeModalShown, setWasTableTypeModalShown] = useState(showTableTypeModal);
  if (showTableTypeModal !== wasTableTypeModalShown) {
    setWasTableTypeModalShown(showTableTypeModal);
    if (showTableTypeModal) tableTypeForm.reset(tableTypeDefaultValues);
  }

  const handleSaveTableType = () => {
    void tableTypeForm.handleSubmit();
  };

  return (
    <>
      <Dialog
        open={showTableTypeModal}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent admin size="default">
          <DialogHeader>
            <DialogTitle id="table-type-modal-title">
              {editingTableTypeId ? m.admin_edit_table_type() : m.admin_add_table_type()}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {addTableTypeError && (
              <Alert
                role="alert"
                aria-live="assertive"
                variant="danger"
                className="py-1 mb-4 text-sm"
              >
                {addTableTypeError}
              </Alert>
            )}
            <AdminField className="mb-4" controlId="tt-venue">
              <AdminLabel>{m.admin_room_venue_label()}</AdminLabel>
              <tableTypeForm.Field name="venueId">
                {(field) => (
                  <AdminSelect
                    value={field.value}
                    onValueChange={(e) => field.handleChange(e)}
                    onBlur={field.handleBlur}
                    className={ADMIN_CONTROL_CLASS}
                  >
                    <AdminOption value="">— {m.admin_room_venue_label()} —</AdminOption>
                    {venues
                      .filter((v) => v.active || v.id === field.value)
                      .map((v) => (
                        <AdminOption key={v.id} value={v.id}>
                          {v.name}
                        </AdminOption>
                      ))}
                  </AdminSelect>
                )}
              </tableTypeForm.Field>
            </AdminField>
            <AdminField className="mb-4" controlId="tt-name">
              <AdminLabel>{m.admin_table_type_name_label()}</AdminLabel>
              <tableTypeForm.Field name="name">
                {(field) => (
                  <AdminInput
                    type="text"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className={ADMIN_CONTROL_CLASS}
                    placeholder={m.admin_table_type_name_placeholder()}
                  />
                )}
              </tableTypeForm.Field>
            </AdminField>
            <AdminField className="mb-4" controlId="tt-shape">
              <AdminLabel>{m.admin_table_shape_label()}</AdminLabel>
              <tableTypeForm.Field name="shape">
                {(field) => (
                  <AdminSelect
                    value={field.value}
                    onValueChange={(e) => {
                      const s = e as "rectangle" | "round";
                      field.handleChange(s);
                      // Same reasoning as emptyTableTypeForm: a shape switch invalidates
                      // whatever dimensions were entered, and no generic replacement is
                      // defensible (#833/#835) — blank them rather than inventing values.
                      tableTypeForm.setFieldValue("widthM", "");
                      tableTypeForm.setFieldValue("lengthM", "");
                    }}
                    onBlur={field.handleBlur}
                    className={ADMIN_CONTROL_CLASS}
                  >
                    <AdminOption value="rectangle">{m.admin_table_shape_rectangle()}</AdminOption>
                    <AdminOption value="round">{m.admin_table_shape_round()}</AdminOption>
                  </AdminSelect>
                )}
              </tableTypeForm.Field>
            </AdminField>
            <AdminField className="mb-4" controlId="tt-height-type">
              <AdminLabel>{m.admin_table_height_type_label()}</AdminLabel>
              <tableTypeForm.Field name="heightType">
                {(field) => (
                  <AdminSelect
                    value={field.value}
                    onValueChange={(e) => field.handleChange(e as "low" | "high")}
                    onBlur={field.handleBlur}
                    className={ADMIN_CONTROL_CLASS}
                  >
                    <AdminOption value="low">{m.admin_table_height_type_low()}</AdminOption>
                    <AdminOption value="high">{m.admin_table_height_type_high()}</AdminOption>
                  </AdminSelect>
                )}
              </tableTypeForm.Field>
            </AdminField>
            {tableTypeValues.shape === "round" ? (
              <AdminField className="mb-4" controlId="tt-diameter">
                <AdminLabel>{m.admin_table_diameter_label()}</AdminLabel>
                <tableTypeForm.Field name="widthM">
                  {(field) => (
                    <AdminInput
                      type="number"
                      min={0.1}
                      max={20}
                      step={0.1}
                      required
                      value={field.value}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === "" ? "" : Number(raw);
                        field.handleChange(v);
                        tableTypeForm.setFieldValue("lengthM", v);
                      }}
                      onBlur={field.handleBlur}
                      className={ADMIN_CONTROL_CLASS}
                    />
                  )}
                </tableTypeForm.Field>
              </AdminField>
            ) : (
              <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2 mb-4">
                <div className="min-w-0 flex-1">
                  <AdminField controlId="tt-width">
                    <AdminLabel>{m.admin_table_width_label()}</AdminLabel>
                    <tableTypeForm.Field name="widthM">
                      {(field) => (
                        <AdminInput
                          type="number"
                          min={0.1}
                          max={20}
                          step={0.1}
                          required
                          value={field.value}
                          onChange={(e) => {
                            const raw = e.target.value;
                            field.handleChange(raw === "" ? "" : Number(raw));
                          }}
                          onBlur={field.handleBlur}
                          className={ADMIN_CONTROL_CLASS}
                        />
                      )}
                    </tableTypeForm.Field>
                  </AdminField>
                </div>
                <div className="min-w-0 flex-1">
                  <AdminField controlId="tt-length">
                    <AdminLabel>{m.admin_table_length_label()}</AdminLabel>
                    <tableTypeForm.Field name="lengthM">
                      {(field) => (
                        <AdminInput
                          type="number"
                          min={0.1}
                          max={20}
                          step={0.1}
                          required
                          value={field.value}
                          onChange={(e) => {
                            const raw = e.target.value;
                            field.handleChange(raw === "" ? "" : Number(raw));
                          }}
                          onBlur={field.handleBlur}
                          className={ADMIN_CONTROL_CLASS}
                        />
                      )}
                    </tableTypeForm.Field>
                  </AdminField>
                </div>
              </div>
            )}
            <AdminField controlId="tt-max-capacity">
              <AdminLabel>{m.admin_table_type_max_capacity()}</AdminLabel>
              <tableTypeForm.Field name="capacity">
                {(field) => (
                  <AdminInput
                    type="number"
                    min={1}
                    max={50}
                    value={field.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    onBlur={field.handleBlur}
                    className={ADMIN_CONTROL_CLASS}
                  />
                )}
              </tableTypeForm.Field>
            </AdminField>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onClose()}>
              {m.admin_action_cancel()}
            </Button>
            <Button
              variant="warning"
              onClick={handleSaveTableType}
              disabled={
                !tableTypeValues.name.trim() ||
                !tableTypeValues.venueId ||
                tableTypeValues.capacity < 1 ||
                !Number.isInteger(tableTypeValues.capacity) ||
                typeof tableTypeValues.widthM !== "number" ||
                tableTypeValues.widthM <= 0 ||
                typeof tableTypeValues.lengthM !== "number" ||
                tableTypeValues.lengthM <= 0
              }
            >
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {tableTypeDimensionConfirm && (
        <ConfirmModal
          admin
          show
          title={m.admin_table_type_dimension_change_title()}
          body={m.admin_table_type_dimension_change_confirm({
            tableCount: tableTypeDimensionConfirm.tableCount,
            roomCount: tableTypeDimensionConfirm.roomCount,
          })}
          variant="warning"
          icon="exclamation-triangle"
          confirmLabel={m.admin_action_confirm()}
          errorFallback={m.admin_content_error_save()}
          onConfirm={() =>
            commitSaveTableType(
              tableTypeDimensionConfirm.payload,
              tableTypeDimensionConfirm.editingId,
            )
          }
          onHide={() => setTableTypeDimensionConfirm(null)}
        />
      )}
    </>
  );
}
