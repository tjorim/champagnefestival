import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
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
import type { TableType } from "@/api-types";
import { type NewTableState } from "./layoutTypes";
import type { Dispatch, SetStateAction } from "react";

interface AddTableDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  error: string | null;
  value: NewTableState;
  onChange: Dispatch<SetStateAction<NewTableState>>;
  tableTypes: TableType[];
  venueId: string | undefined;
}

export function AddTableDialog({
  open,
  onClose,
  onSave,
  error: addTableError,
  value: newTable,
  onChange: setNewTable,
  tableTypes,
  venueId,
}: AddTableDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle id="add-table-modal-title">{m.admin_add_table()}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {addTableError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mb-4 text-sm"
            >
              {addTableError}
            </Alert>
          )}
          <AdminField className="mb-4" controlId="table-name">
            <AdminLabel>{m.admin_table_name()}</AdminLabel>
            <AdminInput
              type="text"
              value={newTable.name}
              onChange={(e) => setNewTable((p) => ({ ...p, name: e.target.value }))}
              className={ADMIN_CONTROL_CLASS}
              placeholder={m.admin_table_name_placeholder()}
            />
          </AdminField>
          <AdminField className="mb-4" controlId="table-type">
            <AdminLabel>{m.admin_table_type_select()}</AdminLabel>
            <AdminSelect
              value={newTable.tableTypeId}
              onValueChange={(e) => setNewTable((p) => ({ ...p, tableTypeId: e }))}
              className={ADMIN_CONTROL_CLASS}
            >
              <AdminOption value="">— {m.admin_table_type_select()} —</AdminOption>
              {tableTypes
                .filter((tt) => tt.venue_id === venueId)
                .map((tt) => (
                  <AdminOption key={tt.id} value={tt.id}>
                    {tt.name} (
                    {tt.shape === "round" ? `⌀${tt.width_m}m` : `${tt.width_m}×${tt.length_m}m`},{" "}
                    {tt.height_type === "high"
                      ? m.admin_table_height_type_high()
                      : m.admin_table_height_type_low()}
                    , {m.admin_layout_capacity_max()} {tt.capacity})
                  </AdminOption>
                ))}
            </AdminSelect>
          </AdminField>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose()}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            onClick={onSave}
            disabled={!newTable.name.trim() || !newTable.tableTypeId}
          >
            {m.admin_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
