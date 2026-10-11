import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { AdminOption, AdminSelect } from "@/components/admin/AdminFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { SPONSOR_TIERS, type SponsorTier } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { sponsorTierLabel } from "@/utils/sponsorTiers";

export interface LineupEntry {
  id: number;
  name: string;
  /** Organisation type; only sponsors get a level. */
  type?: string;
}

interface EditionLineupOrderProps {
  /** The lineup in display order. */
  entries: LineupEntry[];
  /** Level per sponsor (organisation id); sponsors without an entry have none. */
  tiers: Record<number, SponsorTier>;
  onMove: (from: number, to: number) => void;
  onTierChange: (id: number, tier: SponsorTier | null) => void;
}

interface LineupRowProps {
  entry: LineupEntry;
  index: number;
  count: number;
  tier: SponsorTier | null;
  onMove: (from: number, to: number) => void;
  onTierChange: (id: number, tier: SponsorTier | null) => void;
}

function LineupRow({ entry, index, count, tier, onMove, onTierChange }: LineupRowProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: entry.id, index });
  return (
    <li
      ref={ref}
      data-slot="lineup-row"
      data-dragging={isDragging || undefined}
      className="flex flex-wrap items-center gap-2 rounded-md border border-subtle bg-muted px-2 py-1.5 data-dragging:shadow-md"
    >
      <Button
        ref={handleRef}
        type="button"
        variant="ghost"
        size="sm"
        className="cursor-grab touch-none"
        aria-label={m.admin_edition_lineup_drag({ name: entry.name })}
      >
        <Icon icon={GripVerticalIcon} />
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm text-content">{entry.name}</span>
      {entry.type === "sponsor" ? (
        <AdminSelect
          size="sm"
          className="w-40"
          value={tier ?? ""}
          aria-label={m.admin_edition_sponsor_level({ name: entry.name })}
          onValueChange={(value) =>
            onTierChange(entry.id, SPONSOR_TIERS.find((candidate) => candidate === value) ?? null)
          }
        >
          <AdminOption value="">{m.admin_edition_sponsor_level_none()}</AdminOption>
          {SPONSOR_TIERS.map((candidate) => (
            <AdminOption key={candidate} value={candidate}>
              {sponsorTierLabel(candidate)}
            </AdminOption>
          ))}
        </AdminSelect>
      ) : (
        <Badge variant="secondary">{m.admin_item_producer()}</Badge>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={index === 0}
        aria-label={m.admin_edition_lineup_move_up({ name: entry.name })}
        onClick={() => onMove(index, index - 1)}
      >
        <Icon icon={ChevronUpIcon} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={index === count - 1}
        aria-label={m.admin_edition_lineup_move_down({ name: entry.name })}
        onClick={() => onMove(index, index + 1)}
      >
        <Icon icon={ChevronDownIcon} />
      </Button>
    </li>
  );
}

/**
 * The edition lineup as a reorderable list (#1226): drag a row (or use its arrow buttons)
 * to set the order the public site follows, and give each sponsor its level.
 */
export function EditionLineupOrder({
  entries,
  tiers,
  onMove,
  onTierChange,
}: EditionLineupOrderProps) {
  if (entries.length === 0) return null;
  return (
    <div data-slot="lineup-order" className="mb-4">
      <div className="mb-1 text-sm font-semibold text-content">
        {m.admin_edition_lineup_order()}
      </div>
      <p className="mb-2 text-sm text-subtle">{m.admin_edition_lineup_order_help()}</p>
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled) return;
          const { source } = event.operation;
          if (!isSortable(source)) return;
          if (source.initialIndex !== source.index) onMove(source.initialIndex, source.index);
        }}
      >
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {entries.map((entry, index) => (
            <LineupRow
              key={entry.id}
              entry={entry}
              index={index}
              count={entries.length}
              tier={tiers[entry.id] ?? null}
              onMove={onMove}
              onTierChange={onTierChange}
            />
          ))}
        </ul>
      </DragDropProvider>
    </div>
  );
}
