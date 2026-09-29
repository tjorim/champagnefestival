import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { m } from "@/paraglide/messages";
import type { AdminTableFeatures } from "@/hooks/useAdminTable";
import type { RowData, Table } from "@tanstack/react-table";

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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" />}
        id={`col-vis-toggle-${tableId}`}
      >
        <Columns3 aria-hidden="true" className="tw:size-4" />
        {m.admin_columns()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {columns.map((column) => {
          const header =
            typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              id={`col-vis-${tableId}-${column.id}`}
              checked={column.getIsVisible()}
              onCheckedChange={(visible) => column.toggleVisibility(visible)}
              closeOnClick={false}
            >
              {header}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
