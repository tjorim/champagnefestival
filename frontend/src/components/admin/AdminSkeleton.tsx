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
const TABLE_SECTIONS = new Set([
  "registrations",
  "directory",
  "members",
  "volunteers",
  "audit-log",
]);

export function skeletonVariantForSection(activeKey: string): AdminSkeletonVariant {
  return TABLE_SECTIONS.has(activeKey) ? "table" : "panel";
}

export default function AdminSkeleton({ variant, rows = 6 }: AdminSkeletonProps) {
  return (
    // One live region for the whole pane: the bars are decorative, so screen
    // readers get a single "loading" announcement rather than a stream of noise.
    <div className="admin-skeleton" role="status" aria-busy="true">
      <span className="tw:sr-only">{m.admin_loading()}</span>

      <div className="admin-skeleton-toolbar" aria-hidden="true">
        <div className="admin-skeleton-bar tw:h-8 tw:w-36" />
        <div className="admin-skeleton-bar tw:h-8 tw:w-24" />
        <div className="admin-skeleton-bar admin-skeleton-grow tw:h-8 tw:max-w-64" />
      </div>

      {variant === "table" ? (
        <div className="admin-skeleton-table" aria-hidden="true">
          {Array.from({ length: rows }, (_, row) => (
            <div className="admin-skeleton-row" key={row}>
              <div className="admin-skeleton-bar tw:w-3/8" />
              <div className="admin-skeleton-bar tw:w-1/5" />
              <div className="admin-skeleton-bar tw:w-1/6" />
              <div className="admin-skeleton-bar tw:w-1/8" />
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-skeleton-cards" aria-hidden="true">
          {Array.from({ length: Math.min(rows, 4) }, (_, card) => (
            <div className="admin-skeleton-card" key={card}>
              <div className="admin-skeleton-bar tw:h-4.5 tw:w-9/20" />
              <div className="admin-skeleton-bar tw:w-4/5" />
              <div className="admin-skeleton-bar tw:w-13/20" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
