import { UsersIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/react";
import type { FloorTable, TableType } from "@/api-types";
import { getTableSizePx } from "@/lib/venue/layoutUtils";

// ---------------------------------------------------------------------------
// DraggableTable
// ---------------------------------------------------------------------------

interface DraggableTableProps {
  table: FloorTable;
  tableTypes: TableType[];
  assignedCount: number;
  exclusive: boolean;
  isSelected: boolean;
  isInteractive: boolean;
  canDrag: boolean;
  isInSelectedArea: boolean;
  onClick: () => void;
  canvasW: number;
  canvasH: number;
}

export function DraggableTable({
  table,
  tableTypes,
  assignedCount,
  exclusive,
  isSelected,
  isInteractive,
  canDrag,
  isInSelectedArea,
  onClick,
  canvasW,
  canvasH,
}: DraggableTableProps) {
  const { ref, isDragging } = useDraggable({
    id: table.id,
    disabled: !canDrag || !isInteractive,
  });

  const { width: TABLE_W, height: TABLE_L } = getTableSizePx(table, tableTypes);
  const type = tableTypes.find((t) => t.id === table.table_type_id);
  const shape = type?.shape ?? "rectangle";

  const leftPx = (table.x / 100) * canvasW;
  const topPx = (table.y / 100) * canvasH;

  const isOverfilled = table.capacity > 0 && assignedCount > table.capacity;
  const isFull = exclusive || (table.capacity > 0 && assignedCount === table.capacity);
  const borderCls = isSelected
    ? "border-warning"
    : isOverfilled
      ? "border-destructive"
      : isFull
        ? "border-warning"
        : assignedCount > 0
          ? "border-success"
          : "border-subtle";
  const bgCls = isSelected
    ? "bg-warning/25 text-highlight"
    : isOverfilled
      ? "bg-destructive/10 text-destructive"
      : isFull
        ? "bg-warning/10 text-highlight"
        : assignedCount > 0
          ? "bg-success/10 text-success-text"
          : "bg-muted text-subtle";

  return (
    <div
      ref={ref}
      data-plan-table={table.id}
      onClick={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute flex flex-col items-center justify-center border text-center",
        shape === "round" ? "rounded-full" : "rounded-md",
        borderCls,
        bgCls,
      )}

      /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
      style={{
        left: leftPx,
        top: topPx,
        width: TABLE_W,
        height: TABLE_L,
        cursor: isDragging ? "grabbing" : isInteractive ? "grab" : "default",
        userSelect: "none",
        transform: `rotate(${table.rotation}deg)`,
        zIndex: isDragging ? 10 : 1,
        opacity: isInteractive ? (isDragging ? 0.8 : 1) : isInSelectedArea ? 0.7 : 0.25,
        transition: isDragging ? undefined : "border-color 0.15s, opacity 0.15s",
        pointerEvents: isInteractive ? undefined : "none",
      }}
      /* oxlint-enable shadcn/no-inline-styles */
      title={`${table.name} — ${assignedCount}/${table.capacity}`}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? isSelected : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <Icon icon={UsersIcon} className="text-xl" />
      <span className="text-sm font-semibold text-tiny">{table.name}</span>
      <span className="text-micro">
        {assignedCount}/{table.capacity}
      </span>
    </div>
  );
}
