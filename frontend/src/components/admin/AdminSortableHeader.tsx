import type { ReactNode } from "react";
import type { Column, RowData } from "@tanstack/react-table";
import type { AdminTableFeatures } from "@/hooks/useAdminTable";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
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
  const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
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
          <Icon aria-hidden="true" className="size-4" />
        </Button>
      ) : (
        children
      )}
    </TableHead>
  );
}
