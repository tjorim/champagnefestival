import { useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FloorTable } from "@/types/admin";
import type { Registration, TableAllocation } from "@/types/registration";
import { m } from "@/paraglide/messages";

export default function AllocationEditor({
  registration,
  tables,
  onSave,
}: {
  registration: Registration;
  tables: FloorTable[];
  onSave: (id: string, allocations: TableAllocation[]) => Promise<void>;
}) {
  const [entries, setEntries] = useState<TableAllocation[]>(registration.allocations ?? []);
  const [pending, setPending] = useState(false);
  const wholeTables = registration.bookedTableQuantity ?? 0;
  const assigned = wholeTables ? entries.length : entries.reduce((n, a) => n + a.guestCount, 0);
  const total = wholeTables || registration.guestCount;
  const change = (index: number, patch: Partial<TableAllocation>) =>
    setEntries((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  return (
    <fieldset disabled={pending || registration.status === "cancelled"}>
      <legend className="fs-6">{m.admin_action_assign_table()}</legend>
      <p className="small">
        {m.admin_allocation_progress({
          assigned,
          total,
          unit: wholeTables ? m.admin_inventory_unit_table() : m.admin_inventory_unit_person(),
        })}
      </p>
      {entries.map((entry, index) => (
        <div key={index} className="d-flex gap-2 mb-2 align-items-center">
          <Form.Select
            aria-label={m.admin_inventory_unit_table()}
            value={entry.tableId}
            onChange={(e) => change(index, { tableId: e.target.value })}
          >
            <option value="">{m.admin_unassigned()}</option>
            {tables
              .filter((t) => t.id === entry.tableId || !entries.some((a) => a.tableId === t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.capacity})
                </option>
              ))}
          </Form.Select>
          <Form.Control
            type="number"
            min={wholeTables ? 0 : 1}
            max={20}
            aria-label={m.admin_guests_count()}
            value={entry.guestCount}
            onChange={(e) => change(index, { guestCount: Number(e.target.value) })}
            style={{ maxWidth: "6rem" }}
          />
          <Button
            variant="outline-danger"
            onClick={() => setEntries((prev) => prev.filter((_, i) => i !== index))}
          >
            {m.admin_inventory_remove()}
          </Button>
        </div>
      ))}
      <div className="d-flex gap-2">
        <Button
          variant="outline-secondary"
          disabled={assigned >= total}
          onClick={() =>
            setEntries((prev) => [
              ...prev,
              { tableId: "", guestCount: wholeTables ? 0 : 1, exclusive: wholeTables > 0 },
            ])
          }
        >
          {m.admin_allocation_add()}
        </Button>
        <Button
          disabled={entries.some((a) => !a.tableId || !Number.isInteger(a.guestCount))}
          onClick={async () => {
            setPending(true);
            try {
              await onSave(registration.id, entries);
            } catch {
              /* Parent displays server validation. */
            } finally {
              setPending(false);
            }
          }}
        >
          {m.admin_save()}
        </Button>
      </div>
    </fieldset>
  );
}
