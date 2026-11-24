import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
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
import type { Layout } from "@/api-types";
import { getDayLabel, type DayOption } from "./layoutDays";
import { type NewLayoutState } from "./layoutTypes";
import type { Dispatch, SetStateAction } from "react";

interface AddLayoutDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  error: string | null;
  value: NewLayoutState;
  onChange: Dispatch<SetStateAction<NewLayoutState>>;
  dayOptions: DayOption[];
  roomLayouts: Layout[];
}

export function AddLayoutDialog({
  open,
  onClose,
  onSave,
  error: addLayoutError,
  value: newLayout,
  onChange: setNewLayout,
  dayOptions,
  roomLayouts,
}: AddLayoutDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle id="add-layout-modal-title">{m.admin_add_layout()}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {addLayoutError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mb-4 text-sm"
            >
              {addLayoutError}
            </Alert>
          )}
          <AdminField className="mb-4" controlId="layout-day">
            <AdminLabel>{m.admin_layout_day_label()}</AdminLabel>
            <AdminSelect
              value={newLayout.eventId}
              onValueChange={(e) => setNewLayout((p) => ({ ...p, eventId: e }))}
              className={ADMIN_CONTROL_CLASS}
            >
              {dayOptions.map((day) => (
                <AdminOption key={day.eventId} value={day.eventId}>
                  {day.label}
                </AdminOption>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField controlId="layout-copy-from">
            <AdminLabel>{m.admin_layout_copy_from_label()}</AdminLabel>
            <AdminSelect
              value={newLayout.copyFromLayoutId}
              onValueChange={(e) => setNewLayout((p) => ({ ...p, copyFromLayoutId: e }))}
              className={ADMIN_CONTROL_CLASS}
            >
              <AdminOption value="">{m.admin_layout_copy_from_empty()}</AdminOption>
              {roomLayouts.map((layout) => (
                <AdminOption key={layout.id} value={layout.id}>
                  {getDayLabel(layout, dayOptions)}
                </AdminOption>
              ))}
            </AdminSelect>
          </AdminField>
          {newLayout.copyFromLayoutId && (
            <div className="mt-4 flex flex-col gap-2">
              <AdminCheck
                id="layout-copy-tables"
                type="checkbox"
                className="text-sm"
                checked={newLayout.copyTables}
                onCheckedChange={(e) => setNewLayout((p) => ({ ...p, copyTables: e }))}
                label={m.admin_layout_copy_tables()}
              />
              <AdminCheck
                id="layout-copy-areas"
                type="checkbox"
                className="text-sm"
                checked={newLayout.copyAreas}
                onCheckedChange={(e) =>
                  setNewLayout((p) => ({
                    ...p,
                    copyAreas: e,
                  }))
                }
                label={m.admin_layout_copy_areas()}
              />
              {newLayout.copyAreas && (
                <div className="text-subtle text-sm">{m.admin_layout_copy_areas_hint()}</div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose()}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="success" onClick={onSave}>
            {m.admin_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
