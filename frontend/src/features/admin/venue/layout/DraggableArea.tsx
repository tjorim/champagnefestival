import { AreaIcon } from "@/components/AreaIcon";
import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/react";
import type { FloorArea } from "@/api-types";
import { getAreaSizePx } from "@/lib/venue/layoutUtils";

// ---------------------------------------------------------------------------
// DraggableArea
// ---------------------------------------------------------------------------

interface DraggableAreaProps {
  area: FloorArea;
  assignedLabel: string | null;
  isSelected: boolean;
  isInteractive: boolean;
  canDrag: boolean;
  onClick: () => void;
  canvasW: number;
  canvasH: number;
}

export function DraggableArea({
  area,
  assignedLabel,
  isSelected,
  isInteractive,
  canDrag,
  onClick,
  canvasW,
  canvasH,
}: DraggableAreaProps) {
  const { ref, isDragging } = useDraggable({
    id: area.id,
    disabled: !canDrag || !isInteractive,
  });

  const { width: AREA_W, height: AREA_H } = getAreaSizePx(area.width_m, area.length_m);

  const leftPx = (area.x / 100) * canvasW;
  const topPx = (area.y / 100) * canvasH;

  const borderCls = isSelected ? "border-warning" : "border-info";
  const bgCls = isSelected ? "bg-warning/25 text-highlight" : "bg-info/10 text-info";
  const fadedStyle = !isInteractive ? { opacity: 0.25, pointerEvents: "none" as const } : {};

  return (
    <div
      ref={ref}
      onClick={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute flex flex-col items-center justify-center rounded-md border text-center",
        borderCls,
        bgCls,
      )}

      /* oxlint-disable shadcn/no-inline-styles -- Dynamic floor-plan geometry, interaction state and saved room colors. */
      style={{
        left: leftPx,
        top: topPx,
        width: AREA_W,
        height: AREA_H,
        cursor: isDragging ? "grabbing" : isInteractive ? "grab" : "default",
        userSelect: "none",
        transform: `rotate(${area.rotation}deg)`,
        zIndex: isDragging ? 10 : 2,
        opacity: isDragging ? 0.8 : 1,
        transition: isDragging ? undefined : "border-color 0.15s",
        ...fadedStyle,
      }}
      /* oxlint-enable shadcn/no-inline-styles */
      title={area.label}
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
      <AreaIcon name={area.icon} className="text-xs" />
      <span className="font-semibold truncate w-full text-center px-1 text-micro">
        {area.label}
      </span>
      {assignedLabel && (
        <span
          className="truncate w-full text-center px-1 text-plan opacity-85"

          title={assignedLabel}
        >
          {assignedLabel}
        </span>
      )}
    </div>
  );
}
