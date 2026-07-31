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
      <span className="visually-hidden">{m.admin_loading()}</span>

      <div className="admin-skeleton-toolbar" aria-hidden="true">
        <div className="admin-skeleton-bar" style={{ width: "9rem", height: "2rem" }} />
        <div className="admin-skeleton-bar" style={{ width: "6rem", height: "2rem" }} />
        <div
          className="admin-skeleton-bar admin-skeleton-grow"
          style={{ maxWidth: "16rem", height: "2rem" }}
        />
      </div>

      {variant === "table" ? (
        <div className="admin-skeleton-table" aria-hidden="true">
          {Array.from({ length: rows }, (_, row) => (
            <div className="admin-skeleton-row" key={row}>
              <div className="admin-skeleton-bar" style={{ width: "38%" }} />
              <div className="admin-skeleton-bar" style={{ width: "22%" }} />
              <div className="admin-skeleton-bar" style={{ width: "16%" }} />
              <div className="admin-skeleton-bar" style={{ width: "12%" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-skeleton-cards" aria-hidden="true">
          {Array.from({ length: Math.min(rows, 4) }, (_, card) => (
            <div className="admin-skeleton-card" key={card}>
              <div className="admin-skeleton-bar" style={{ width: "45%", height: "1.1rem" }} />
              <div className="admin-skeleton-bar" style={{ width: "80%" }} />
              <div className="admin-skeleton-bar" style={{ width: "65%" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
