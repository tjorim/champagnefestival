import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";

/**
 * Loading placeholder for the admin content pane.
 *
 * A centered spinner tells you only "something is happening" and collapses the
 * layout, so the pane jumps when data lands. These placeholders hold the shape
 * of what is coming, which keeps the page stable and makes the wait read as
 * shorter than it is.
 */

export type AdminSkeletonVariant = "table" | "panel";

interface AdminSkeletonProps {
  variant: AdminSkeletonVariant;
  /** Row/card count. The default fills a typical viewport without overflowing it. */
  rows?: number;
}

/** Sections whose content is a list; everything else gets the card layout. */
const TABLE_SECTIONS = new Set(["registrations", "people", "audit-log"]);

export function skeletonVariantForSection(activeKey: string): AdminSkeletonVariant {
  return TABLE_SECTIONS.has(activeKey) ? "table" : "panel";
}

export default function AdminSkeleton({ variant, rows = 6 }: AdminSkeletonProps) {
  return (
    // One live region for the whole pane: the bars are decorative, so screen
    // readers get a single "loading" announcement rather than a stream of noise.
    <div className="admin-skeleton flex flex-col gap-4" role="status" aria-busy="true">
      <span className="sr-only">{m.admin_loading()}</span>

      <div className="flex flex-wrap items-center gap-3" aria-hidden="true">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="grow h-8 max-w-64" />
      </div>

      {variant === "table" ? (
        <div
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
          aria-hidden="true"
        >
          {Array.from({ length: rows }, (_, row) => (
            <div className="admin-skeleton-row flex items-center gap-4" key={row}>
              <Skeleton className="h-3.5 w-3/8" />
              <Skeleton className="h-3.5 w-1/5" />
              <Skeleton className="h-3.5 w-1/6" />
              <Skeleton className="h-3.5 w-1/8" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: Math.min(rows, 4) }, (_, card) => (
            <div
              className="admin-skeleton-card flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              key={card}
            >
              <Skeleton className="h-4.5 w-9/20" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-13/20" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
