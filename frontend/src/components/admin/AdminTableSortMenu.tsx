import type { RowData, Table } from "@tanstack/react-table";
import type { AdminTableFeatures } from "@/hooks/useAdminTable";
import { ArrowUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { m } from "@/paraglide/messages";

/** Compact access to server-side sorting when the responsive list uses cards. */
export function AdminTableSortMenu<T extends RowData>({
  table,
}: {
  table: Pick<Table<AdminTableFeatures, T>, "getAllLeafColumns" | "resetSorting">;
}) {
  const columns = table.getAllLeafColumns().filter((column) => column.getCanSort());
  const current = columns.find((column) => column.getIsSorted());
  const label = (column: (typeof columns)[number]) =>
    typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
  const sortedLabel = current
    ? current.getIsSorted() === "desc"
      ? m.admin_table_sort_descending({ column: label(current) })
      : m.admin_table_sort_ascending({ column: label(current) })
    : "";
  if (columns.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <ArrowUpDownIcon className="size-4 shrink-0" aria-hidden="true" />
        {m.admin_table_sort()}
        {sortedLabel ? `: ${sortedLabel}` : ""}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {columns.flatMap((column) =>
          [false, true].map((descending) => (
            <DropdownMenuItem
              key={`${column.id}:${descending}`}
              onClick={() => column.toggleSorting(descending)}
            >
              {descending
                ? m.admin_table_sort_descending({ column: label(column) })
                : m.admin_table_sort_ascending({ column: label(column) })}
            </DropdownMenuItem>
          )),
        )}
        <DropdownMenuItem disabled={!current} onClick={() => table.resetSorting(true)}>
          {m.admin_table_sort_clear()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
