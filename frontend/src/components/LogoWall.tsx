import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SliderItem } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { cn } from "@/lib/utils";
import { organizationDescription } from "@/utils/organizationDescription";

type LogoWallType = "producers" | "sponsors" | "vendors";

interface LogoWallProps {
  itemsType?: LogoWallType;
  items?: SliderItem[];
}

const COLLAPSED_LIMIT: Record<LogoWallType, number> = {
  producers: 8,
  vendors: 8,
  sponsors: 12,
};

const FALLBACK_IMAGE = "/images/logo.svg";

function showAllLabel(itemsType: LogoWallType, count: number): string {
  if (itemsType === "producers") return m.logo_wall_show_all_producers({ count });
  if (itemsType === "vendors") return m.logo_wall_show_all_vendors({ count });
  return m.logo_wall_show_all_sponsors({ count });
}

function LogoImage({ item, className }: { item: SliderItem; className: string }) {
  return (
    <img
      src={item.image}
      alt={item.name}
      loading="lazy"
      className={className}
      onError={(event) => {
        // Quietly fall back without console errors; clear the handler to avoid loops.
        event.currentTarget.onerror = null;
        event.currentTarget.src = FALLBACK_IMAGE;
      }}
    />
  );
}

/**
 * Calm, scannable logo wall for producers, vendors and sponsors. Producers and
 * vendors get uniform cards with a clamped description; sponsors get a lighter
 * centred row of logo tiles.
 */
function LogoWall({ itemsType = "producers", items = [] }: LogoWallProps) {
  const gridId = useId();
  const [expanded, setExpanded] = useState(false);
  const locale = getLocale();
  const isSponsors = itemsType === "sponsors";

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" })),
    [items, locale],
  );

  if (sorted.length === 0) return null;

  const limit = COLLAPSED_LIMIT[itemsType];
  const collapsible = sorted.length > limit;
  const visible = collapsible && !expanded ? sorted.slice(0, limit) : sorted;

  return (
    <div data-slot="logo-wall" data-items-type={itemsType} className="mx-auto my-6 w-full">
      <ul
        id={gridId}
        className={cn(
          "m-0 flex list-none flex-wrap justify-center p-0",
          isSponsors ? "items-start gap-4" : "items-stretch",
        )}
      >
        {visible.map((item) => {
          const description = isSponsors ? null : organizationDescription(item, locale);
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
                className="flex w-full min-w-0 flex-col items-center gap-2 rounded-md border border-border bg-card p-3 text-center text-card-foreground"
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
                <h3 className="m-0 w-full text-sm font-semibold wrap-break-word">{item.name}</h3>
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
    </div>
  );
}

export default LogoWall;
