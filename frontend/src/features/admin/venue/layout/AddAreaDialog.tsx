import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminOptionGroup,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { AreaIcon } from "@/components/AreaIcon";
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
import { getAreaIcons } from "./areaIcons";
import { type ItemRef, type NewAreaState } from "./layoutTypes";
import type { Dispatch, SetStateAction } from "react";

interface AddAreaDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  error: string | null;
  value: NewAreaState;
  onChange: Dispatch<SetStateAction<NewAreaState>>;
  organizations: ItemRef[];
}

export function AddAreaDialog({
  open,
  onClose,
  onSave,
  error: addAreaError,
  value: newArea,
  onChange: setNewArea,
  organizations,
}: AddAreaDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle id="add-area-modal-title">{m.admin_layout_add_area()}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {addAreaError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mb-4 text-sm"
            >
              {addAreaError}
            </Alert>
          )}
          <AdminField className="mb-4" controlId="area-new-label">
            <AdminLabel>{m.admin_layout_area_form_label()}</AdminLabel>
            <AdminInput
              type="text"
              value={newArea.label}
              onChange={(e) => setNewArea((p) => ({ ...p, label: e.target.value }))}
              className={ADMIN_CONTROL_CLASS}
              placeholder={m.admin_layout_area_label_placeholder()}
            />
          </AdminField>
          <AdminField className="mb-4" controlId="area-new-icon">
            <AdminLabel>{m.admin_layout_area_form_icon()}</AdminLabel>
            <div className="flex gap-2 items-center">
              <AreaIcon name={newArea.icon} className="text-2xl text-primary" />
              <AdminSelect
                value={newArea.icon}
                onValueChange={(e) => setNewArea((p) => ({ ...p, icon: e }))}
                className={ADMIN_CONTROL_CLASS}
              >
                {getAreaIcons().map((ic) => (
                  <AdminOption key={ic.value} value={ic.value}>
                    {ic.label}
                  </AdminOption>
                ))}
              </AdminSelect>
            </div>
          </AdminField>
          <AdminField className="mb-4" controlId="area-new-assign">
            <AdminLabel>{m.admin_layout_area_assigned_to_optional()}</AdminLabel>
            <AdminSelect
              value={newArea.assignedType ? `${newArea.assignedType}:${newArea.assignedId}` : ""}
              onValueChange={(e) => {
                const val = e;
                if (!val) {
                  setNewArea((p) => ({ ...p, assignedType: "", assignedId: 0 }));
                } else {
                  const [t, id] = val.split(":");
                  const entityName = organizations.find((x) => x.id === Number(id))?.name;
                  setNewArea((p) => ({
                    ...p,
                    assignedType: t as "e",
                    assignedId: Number(id),
                    label: p.label || (entityName ?? p.label),
                  }));
                }
              }}
              className={ADMIN_CONTROL_CLASS}
            >
              <AdminOption value="">{m.admin_layout_area_none()}</AdminOption>
              {organizations.filter((e) => e.active).length > 0 && (
                <AdminOptionGroup label={m.admin_layout_area_organizations_group()}>
                  {organizations
                    .filter((e) => e.active)
                    .map((e) => (
                      <AdminOption key={e.id} value={`e:${e.id}`}>
                        {e.name}
                      </AdminOption>
                    ))}
                </AdminOptionGroup>
              )}
            </AdminSelect>
          </AdminField>
          <div className="flex flex-wrap -mx-2 *:w-full *:px-2 gap-y-4">
            <div className="min-w-0 flex-1">
              <AdminField controlId="area-new-width">
                <AdminLabel>{m.admin_layout_area_width_m()}</AdminLabel>
                <AdminInput
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.5}
                  value={newArea.widthM}
                  onChange={(e) => setNewArea((p) => ({ ...p, widthM: Number(e.target.value) }))}
                  className={ADMIN_CONTROL_CLASS}
                />
              </AdminField>
            </div>
            <div className="min-w-0 flex-1">
              <AdminField controlId="area-new-length">
                <AdminLabel>{m.admin_layout_area_length_m()}</AdminLabel>
                <AdminInput
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.5}
                  value={newArea.lengthM}
                  onChange={(e) => setNewArea((p) => ({ ...p, lengthM: Number(e.target.value) }))}
                  className={ADMIN_CONTROL_CLASS}
                />
              </AdminField>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose()}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="info" onClick={onSave} disabled={!newArea.label.trim()}>
            {m.admin_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
