import type { ReactNode } from "react";
import type { Column, RowData } from "@tanstack/react-table";
import type { AdminTableFeatures } from "@/hooks/useAdminTable";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export function AdminSortableHeader<T extends RowData>({
  column,
  children,
}: {
  column: Column<AdminTableFeatures, T>;
  children: ReactNode;
}) {
  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead
      className={column.columnDef.meta?.tdClassName}
      aria-sort={
        canSort
          ? sorted === "asc"
            ? "ascending"
            : sorted === "desc"
              ? "descending"
              : "none"
          : undefined
      }
    >
      {canSort ? (
        <Button variant="ghost" size="sm" onClick={column.getToggleSortingHandler()}>
          {children}
          <Icon aria-hidden="true" className="tw:size-4" />
        </Button>
      ) : (
        children
      )}
    </TableHead>
  );
}
