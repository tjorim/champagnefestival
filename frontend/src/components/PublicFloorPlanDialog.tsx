import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaIcon } from "@/components/AreaIcon";
import { Alert } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getCanvasSizePx, safeRoomColor } from "@/utils/layoutUtils";
import {
  editionPlanQueryOptions,
  initialPlanSelection,
  planAreaBox,
  type EditionPlan,
  type PlanArea,
  type PlanRoom,
  type PlanSelection,
  type PlanTarget,
} from "@/utils/planApi";
import { formatStandDay } from "@/utils/standsApi";

interface PublicFloorPlanDialogProps {
  editionId: string;
  /** The stand to highlight, or `null` while the dialog is closed. */
  target: PlanTarget | null;
  /** Display name of the organization whose stand is highlighted. */
  organizationName: string;
  locale: string;
  onClose: () => void;
}

function areaClassName(area: PlanArea, highlighted: boolean): string {
  if (highlighted) return "z-10 border-primary bg-primary text-primary-foreground ring-2 ring-ring";
  if (area.organization_id === null)
    return "border-dashed border-border bg-background text-muted-foreground";
  return "border-border bg-muted text-foreground";
}

/** One room as a read-only canvas: the highlighted stand is marked and scrolled into view. */
function RoomCanvas({ room, organizationId }: { room: PlanRoom; organizationId: number | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvas = getCanvasSizePx(room.width_m, room.length_m);

  useEffect(() => {
    // Not every environment implements scrollIntoView (jsdom does not).
    scrollRef.current
      ?.querySelector('[aria-current="location"]')
      ?.scrollIntoView?.({ block: "center", inline: "center" });
  }, [room.id, organizationId]);

  return (
    <div
      ref={scrollRef}
      data-slot="public-plan-scroll"
      tabIndex={0}
      role="region"
      aria-label={m.floor_plan_canvas_label({ room: room.name })}
      className="overflow-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div
        data-slot="public-plan-canvas"
        className="relative w-full overflow-hidden rounded-md border-2 bg-card"
        /* oxlint-disable shadcn/no-inline-styles -- Room aspect ratio, natural minimum size and saved room color are per-room data (docs/floor-plan-coordinates.md). */
        style={{
          aspectRatio: `${canvas.width} / ${canvas.height}`,
          minWidth: canvas.width,
          borderColor: safeRoomColor(room.color),
        }}
        /* oxlint-enable shadcn/no-inline-styles */
      >
        {room.areas.map((area) => {
          const box = planAreaBox(area, room);
          const highlighted = organizationId !== null && area.organization_id === organizationId;
          return (
            <div
              key={area.id}
              data-highlighted={highlighted || undefined}
              aria-current={highlighted ? "location" : undefined}
              title={area.label}
              className={cn(
                "absolute flex items-center justify-center gap-1 overflow-hidden rounded-sm border px-1 text-xs leading-tight",
                areaClassName(area, highlighted),
              )}
              /* oxlint-disable shadcn/no-inline-styles -- Floor-plan x/y percentages, size and rotation per docs/floor-plan-coordinates.md. */
              style={{
                left: `${box.left}%`,
                top: `${box.top}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
                transform: `rotate(${area.rotation}deg)`,
              }}
              /* oxlint-enable shadcn/no-inline-styles */
            >
              <AreaIcon name={area.icon} />
              <span className="min-w-0 truncate">{area.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanViewer({
  plan,
  target,
  organizationName,
  locale,
}: {
  plan: EditionPlan;
  target: PlanTarget;
  organizationName: string;
  locale: string;
}) {
  const days = plan.days.filter((day) => day.rooms.length > 0);
  const [selection, setSelection] = useState<PlanSelection | null>(() =>
    initialPlanSelection(plan, target),
  );
  const day = days.find((candidate) => candidate.event_id === selection?.eventId) ?? days[0];
  const room = day?.rooms.find((candidate) => candidate.id === selection?.roomId) ?? day?.rooms[0];
  if (!day || !room) return <Alert variant="info">{m.floor_plan_empty()}</Alert>;

  const highlighted = room.areas.filter((area) => area.organization_id === target.organizationId);
  const selectDay = (eventId: string) => {
    const next = days.find((candidate) => candidate.event_id === eventId);
    if (!next) return;
    // Stay in the same room across days when the room is open on both.
    const sameRoom = next.rooms.find((candidate) => candidate.name === room.name);
    const withStand = next.rooms.find((candidate) =>
      candidate.areas.some((area) => area.organization_id === target.organizationId),
    );
    const chosen = sameRoom ?? withStand ?? next.rooms[0];
    if (chosen) setSelection({ eventId, roomId: chosen.id });
  };

  return (
    <div className="flex flex-col gap-3">
      {days.length > 1 && (
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={m.floor_plan_day()}
          value={[day.event_id]}
          onValueChange={(values) => {
            if (values[0]) selectDay(values[0]);
          }}
        >
          {days.map((candidate) => (
            <ToggleGroupItem key={candidate.event_id} value={candidate.event_id}>
              {formatStandDay(candidate.date, locale)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {day.rooms.length > 1 && (
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={m.floor_plan_room()}
          value={[room.id]}
          onValueChange={(values) => {
            if (values[0]) setSelection({ eventId: day.event_id, roomId: values[0] });
          }}
        >
          {day.rooms.map((candidate) => (
            <ToggleGroupItem key={candidate.id} value={candidate.id}>
              {candidate.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <RoomCanvas room={room} organizationId={target.organizationId} />
      <p role="status" className="m-0 text-sm font-medium">
        {highlighted.length > 0
          ? m.floor_plan_highlighted({
              name: organizationName,
              stands: highlighted.map((area) => area.label).join(", "),
            })
          : m.floor_plan_not_in_room({ name: organizationName })}
      </p>
    </div>
  );
}

/**
 * Read-only floor plan of the festival with one organization's stand highlighted.
 * The plan is an enhancement: the stand text in the details dialog stays the
 * accessible alternative, so a failed or empty plan just says it is unavailable.
 */
export default function PublicFloorPlanDialog({
  editionId,
  target,
  organizationName,
  locale,
  onClose,
}: PublicFloorPlanDialogProps) {
  const query = useQuery({ ...editionPlanQueryOptions(editionId), enabled: target !== null });
  const planKey = target
    ? `${target.organizationId}|${target.stand.event_id}|${target.stand.room_name}|${target.stand.label}`
    : "";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{m.floor_plan_title()}</DialogTitle>
          <DialogDescription>
            {m.floor_plan_description({ name: organizationName })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {query.isPending ? (
            <div className="p-8 text-center">
              <Spinner label={m.loading()} />
            </div>
          ) : query.isError ? (
            <Alert variant="warning">{m.floor_plan_error()}</Alert>
          ) : target ? (
            <PlanViewer
              key={planKey}
              plan={query.data}
              target={target}
              organizationName={organizationName}
              locale={locale}
            />
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
