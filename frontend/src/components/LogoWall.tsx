import { useId, useMemo, useState } from "react";
import { MapPinIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { LogoImage } from "@/components/LogoImage";
import OrganizationDetailModal from "@/components/OrganizationDetailModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SliderItem, SponsorTier } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { cn } from "@/lib/utils";
import { organizationDescription } from "@/utils/organizationDescription";
import { groupSponsorsByTier, sponsorTierLabel, type SponsorGroup } from "@/utils/sponsorTiers";
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

/** Logo tile width per sponsor level: the higher the level, the larger the logo. */
const SPONSOR_TILE_WIDTH: Record<SponsorTier | "none", string> = {
  main: "w-48 sm:w-64",
  partner: "w-40 sm:w-52",
  supporter: "w-36 sm:w-40",
  none: "w-36 sm:w-40",
};

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

interface LogoGroupProps {
  group: SponsorGroup;
  /** Id of the logo list, so the show-all button can control it. */
  listId: string;
  /** Whether level headings are shown; the logo names then sit one heading level lower. */
  tiered: boolean;
  itemsType: LogoWallType;
  locale: string;
  standMap: Map<number, Stand[]>;
  showRoom: boolean;
  onSelect: (item: SliderItem) => void;
}

/** One row of logo tiles: every producer/vendor, or the sponsors of one level. */
function LogoGroup({
  group,
  listId,
  tiered,
  itemsType,
  locale,
  standMap,
  showRoom,
  onSelect,
}: LogoGroupProps) {
  const headingId = useId();
  const isSponsors = itemsType === "sponsors";
  const NameHeading = tiered ? "h4" : "h3";
  const tileWidth = SPONSOR_TILE_WIDTH[group.tier ?? "none"];
  return (
    <div
      data-slot="logo-group"
      data-tier={group.tier ?? undefined}
      role={group.tier ? "group" : undefined}
      aria-labelledby={group.tier ? headingId : undefined}
      className={cn(tiered && "mb-6 last:mb-0")}
    >
      {group.tier && (
        <h3 id={headingId} className="mx-0 mt-0 mb-3 text-base font-semibold text-muted-foreground">
          {sponsorTierLabel(group.tier)}
        </h3>
      )}
      <ul
        id={listId}
        className={cn(
          "m-0 flex list-none flex-wrap justify-center p-0",
          isSponsors ? "items-start gap-4" : "items-stretch",
        )}
      >
        {group.items.map((item) => {
          const description = isSponsors ? null : organizationDescription(item, locale);
          const itemStands = standMap.get(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                "flex min-w-0",
                isSponsors ? tileWidth : "basis-1/2 p-1.5 md:basis-1/3 md:p-2 lg:basis-1/4",
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
                <NameHeading className="m-0 w-full text-sm font-semibold wrap-break-word">
                  {/* Stretched button: the whole card opens the details dialog. */}
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => onSelect(item)}
                    className="m-0 w-full cursor-pointer border-0 bg-transparent p-0 text-inherit outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                  >
                    {item.name}
                  </button>
                </NameHeading>
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
    </div>
  );
}

/**
 * Calm, scannable logo wall for producers, vendors and sponsors. Producers and
 * vendors get uniform cards with a clamped description, sorted by name; sponsors
 * get lighter centred rows of logo tiles in the order the organisers set (by level,
 * larger logos for higher levels, then lineup order).
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
    () =>
      isSponsors
        ? groupSponsorsByTier(items).flatMap((group) => group.items)
        : [...items].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" })),
    [isSponsors, items, locale],
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
  const sponsorGroups: SponsorGroup[] = isSponsors
    ? groupSponsorsByTier(visible)
    : [{ tier: null, items: visible }];
  // Level headings only appear once the organisers use levels at all.
  const tiered = sponsorGroups.some((group) => group.tier !== null);
  const listId = (group: SponsorGroup) => `${gridId}-${group.tier ?? "all"}`;

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
      <div>
        {sponsorGroups.map((group) => (
          <LogoGroup
            key={group.tier ?? "none"}
            group={group}
            listId={listId(group)}
            tiered={tiered}
            itemsType={itemsType}
            locale={locale}
            standMap={standMap}
            showRoom={showRoom}
            onSelect={setSelected}
          />
        ))}
      </div>
      {collapsible && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            aria-expanded={expanded}
            aria-controls={sponsorGroups.map(listId).join(" ")}
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
