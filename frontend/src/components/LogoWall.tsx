import { useId, useMemo, useState } from "react";
import { MapPinIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { LogoImage } from "@/components/LogoImage";
import OrganizationDetailModal from "@/components/OrganizationDetailModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SliderItem } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { cn } from "@/lib/utils";
import { organizationDescription } from "@/utils/organizationDescription";
import {
  hasMultipleRooms,
  standsByOrganization,
  summarizeStands,
  type OrganizationStands,
  type Stand,
} from "@/utils/standsApi";

type LogoWallType = "producers" | "sponsors" | "vendors";

interface LogoWallProps {
  itemsType?: LogoWallType;
  items?: SliderItem[];
  /** Public stand assignments per organization; organizations without one show no stand line. */
  stands?: OrganizationStands[];
}

const COLLAPSED_LIMIT: Record<LogoWallType, number> = {
  producers: 8,
  vendors: 8,
  sponsors: 12,
};

function showAllLabel(itemsType: LogoWallType, count: number): string {
  if (itemsType === "producers") return m.logo_wall_show_all_producers({ count });
  if (itemsType === "vendors") return m.logo_wall_show_all_vendors({ count });
  return m.logo_wall_show_all_sponsors({ count });
}

/** Lower-cased and accent-folded so "moet" finds "Moët". */
function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function searchText(item: SliderItem, stands: Stand[] | undefined): string {
  return normalizeForSearch(
    [item.name, ...(stands ?? []).flatMap((stand) => [stand.label, stand.room_name])].join(" "),
  );
}

function StandLines({
  stands,
  locale,
  showRoom,
}: {
  stands: Stand[];
  locale: string;
  showRoom: boolean;
}) {
  const lines = summarizeStands(stands, locale, showRoom);
  if (lines.length === 0) return null;
  return (
    <p
      data-slot="logo-stand"
      className="m-0 flex w-full min-w-0 items-start justify-center gap-1 text-xs font-medium text-foreground"
    >
      <Icon icon={MapPinIcon} className="mt-0.5 text-primary" />
      <span className="min-w-0 wrap-break-word">
        <span className="sr-only">{m.logo_wall_stand()}: </span>
        {lines.map((line) => (
          <span key={`${line.day ?? ""}|${line.stand}`} className="block">
            {line.day ? m.logo_wall_stand_on_day({ day: line.day, stand: line.stand }) : line.stand}
          </span>
        ))}
      </span>
    </p>
  );
}

/**
 * Calm, scannable logo wall for producers, vendors and sponsors. Producers and
 * vendors get uniform cards with a clamped description; sponsors get a lighter
 * centred row of logo tiles.
 */
function LogoWall({ itemsType = "producers", items = [], stands }: LogoWallProps) {
  const gridId = useId();
  const searchId = useId();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SliderItem | null>(null);
  const locale = getLocale();
  const isSponsors = itemsType === "sponsors";

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" })),
    [items, locale],
  );

  const standMap = useMemo(() => standsByOrganization(stands), [stands]);
  const showRoom = useMemo(() => hasMultipleRooms(stands ?? []), [stands]);

  const searchable = itemsType === "producers" && sorted.length > 1;
  const needle = searchable ? normalizeForSearch(query) : "";
  const matches = useMemo(
    () =>
      needle
        ? sorted.filter((item) => searchText(item, standMap.get(item.id)).includes(needle))
        : sorted,
    [needle, sorted, standMap],
  );

  if (sorted.length === 0) return null;

  const limit = COLLAPSED_LIMIT[itemsType];
  // A search shows every match: hiding results behind "show all" would defeat it.
  const collapsible = !needle && sorted.length > limit;
  const visible = collapsible && !expanded ? sorted.slice(0, limit) : matches;

  return (
    <div data-slot="logo-wall" data-items-type={itemsType} className="mx-auto my-6 w-full">
      {searchable && (
        <div
          data-slot="logo-search"
          className="mx-auto mb-4 flex max-w-md flex-col gap-1.5 text-left"
        >
          <Label htmlFor={searchId}>{m.logo_wall_search_label()}</Label>
          <Input
            id={searchId}
            type="search"
            value={query}
            placeholder={m.logo_wall_search_placeholder()}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <p role="status" className="sr-only">
            {needle && matches.length > 0
              ? m.logo_wall_search_results({ count: matches.length })
              : ""}
          </p>
        </div>
      )}
      {needle && matches.length === 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          {m.logo_wall_search_no_results({ query: query.trim() })}
        </p>
      )}
      <ul
        id={gridId}
        className={cn(
          "m-0 flex list-none flex-wrap justify-center p-0",
          isSponsors ? "items-start gap-4" : "items-stretch",
        )}
      >
        {visible.map((item) => {
          const description = isSponsors ? null : organizationDescription(item, locale);
          const itemStands = standMap.get(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                "flex min-w-0",
                isSponsors ? "w-36 sm:w-40" : "basis-1/2 p-1.5 md:basis-1/3 md:p-2 lg:basis-1/4",
              )}
            >
              <div
                data-slot="logo-card"
                className="relative flex w-full min-w-0 flex-col items-center gap-2 rounded-md border border-border bg-card p-3 text-center text-card-foreground transition-colors hover:bg-muted"
              >
                <div
                  data-slot="logo-frame"
                  className={cn(
                    "flex w-full items-center justify-center overflow-hidden rounded-sm bg-white p-2",
                    isSponsors ? "aspect-3/2" : "aspect-4/3",
                  )}
                >
                  <LogoImage item={item} className="size-full object-contain" />
                </div>
                <h3 className="m-0 w-full text-sm font-semibold wrap-break-word">
                  {/* Stretched button: the whole card opens the details dialog. */}
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setSelected(item)}
                    className="m-0 w-full cursor-pointer border-0 bg-transparent p-0 text-inherit outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                  >
                    {item.name}
                  </button>
                </h3>
                {itemStands && itemStands.length > 0 && (
                  <StandLines stands={itemStands} locale={locale} showRoom={showRoom} />
                )}
                {description && (
                  <p
                    title={description}
                    className="m-0 line-clamp-2 w-full text-xs text-muted-foreground wrap-break-word"
                  >
                    {description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {collapsible && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            aria-expanded={expanded}
            aria-controls={gridId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? m.logo_wall_show_fewer() : showAllLabel(itemsType, sorted.length)}
          </Button>
        </div>
      )}
      <OrganizationDetailModal
        item={selected}
        stands={selected ? standMap.get(selected.id) : undefined}
        locale={locale}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

export default LogoWall;
