import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import { m } from "@/paraglide/messages";
import type { AdminTableFeatures } from "@/hooks/useAdminTable";
import type { RowData, Table } from "@tanstack/table-core";

interface ColumnVisibilityDropdownProps<TData extends RowData> {
  table: Table<AdminTableFeatures, TData>;
  tableId: string;
}

export function ColumnVisibilityDropdown<TData extends RowData>({
  table,
  tableId,
}: ColumnVisibilityDropdownProps<TData>) {
  const columns = table
    .getAllLeafColumns()
    .filter((col) => col.id !== "actions" && col.id !== "select");

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="outline-secondary"
        size="sm"
        id={`col-vis-toggle-${tableId}`}
      >
        <i className="bi bi-layout-three-columns me-1" aria-hidden="true" />
        {m.admin_columns()}
      </Dropdown.Toggle>
      <Dropdown.Menu className="bg-dark border-secondary p-2" style={{ minWidth: "10rem" }}>
        {columns.map((column) => {
          const header =
            typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
          return (
            <Form.Check
              key={column.id}
              type="checkbox"
              id={`col-vis-${tableId}-${column.id}`}
              label={header}
              checked={column.getIsVisible()}
              onChange={() => column.toggleVisibility()}
              className="text-light small px-1"
            />
          );
        })}
      </Dropdown.Menu>
    </Dropdown>
  );
}
