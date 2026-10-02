import { AreaIcon } from "@/components/AreaIcon";
import { UsersIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { m } from "@/paraglide/messages";
import { safeRoomColor } from "@/utils/layoutUtils";
import { venuePlanQueryOptions } from "@/utils/venuePlanApi";

export default function VenuePlanPage() {
  const auth = useAuth();
  const { edition, table } = useSearch({ from: "/admin-layout/venue-plan" });
  const authHeaders = (): Record<string, string> => {
    const token = auth.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  // Same queryOptions the route loader prefetches with (router.tsx) — kept as
  // the single source of truth so the two can't drift out of sync. Staying on
  // useQuery (not useSuspenseQuery) here deliberately preserves this page's
  // existing inline-Alert error handling instead of routing errors through a
  // Suspense error boundary; the loader's prefetch is best-effort and never
  // throws, so this still gets the full benefit (warm cache, no fetch
  // waterfall) without changing this component's error-handling shape.
  const query = useQuery({
    ...venuePlanQueryOptions(edition ?? "", authHeaders),
    enabled: Boolean(edition && (auth.hasRole("admin") || auth.hasRole("volunteer"))),
  });

  if (!edition) return <Alert variant="warning">{m.venue_plan_missing_edition()}</Alert>;
  if (query.isLoading)
    return (
      <div className="tw:text-center tw:p-12">
        <Spinner label={m.loading()} />
      </div>
    );
  if (query.isError) return <Alert variant="danger">{query.error.message}</Alert>;
  if (!query.data?.layouts.length) return <Alert variant="info">{m.venue_plan_empty()}</Alert>;

  return (
    <div className="site-container tw:mx-auto tw:w-full tw:py-4">
      <p className="tw:text-subtle">{m.venue_plan_description()}</p>
      {query.data.layouts.map((layout) => (
        <Card className="tw:mb-6" key={layout.id}>
          <CardHeader className="tw:flex tw:justify-between">
            <strong>
              {layout.room?.name ?? layout.label} — {layout.event_title}
            </strong>
            {layout.date && <Badge variant="secondary">{layout.date}</Badge>}
          </CardHeader>
          <CardContent>
            <div
              data-slot="venue-plan-canvas"
              className="tw:relative tw:min-h-70 tw:w-full tw:overflow-hidden tw:rounded-md tw:border"
              /* oxlint-disable shadcn/no-inline-styles -- Room aspect ratio and saved room color are per-layout data (docs/floor-plan-coordinates.md). */
              style={{
                aspectRatio: `${layout.room?.width_m ?? 4} / ${layout.room?.length_m ?? 3}`,
                borderColor: safeRoomColor(layout.room?.color),
              }}
              /* oxlint-enable shadcn/no-inline-styles */
              aria-label={layout.room?.name ?? layout.label}
            >
              {layout.areas.map((area) => (
                <div
                  key={area.id}
                  className="tw:absolute tw:text-subtle tw:text-sm"
                  /* oxlint-disable shadcn/no-inline-styles -- Floor-plan x/y percentages and rotation per docs/floor-plan-coordinates.md. */
                  style={{
                    left: `${area.x}%`,
                    top: `${area.y}%`,
                    transform: `rotate(${area.rotation}deg)`,
                  }}
                  /* oxlint-enable shadcn/no-inline-styles */
                >
                  <AreaIcon name={area.icon} className="tw:me-1" />
                  {area.label}
                </div>
              ))}
              {layout.tables.map((item) => {
                const selected = item.id === table;
                const occupied = item.occupied_seats;
                const occupancyClass =
                  occupied > item.capacity
                    ? "tw:border-destructive tw:bg-destructive/10 tw:text-destructive"
                    : item.exclusive || occupied === item.capacity
                      ? "tw:border-warning tw:bg-warning/10 tw:text-highlight"
                      : occupied
                        ? "tw:border-success tw:bg-muted tw:text-success"
                        : "tw:border-subtle tw:bg-muted tw:text-foreground";
                return (
                  <div
                    key={item.id}
                    className={`tw:absolute tw:rounded-md tw:border tw:min-w-18 tw:px-2 tw:py-1 tw:text-center ${selected ? "tw:border-warning tw:bg-warning tw:text-contrast" : occupancyClass}`}
                    /* oxlint-disable shadcn/no-inline-styles -- Floor-plan x/y percentages and rotation per docs/floor-plan-coordinates.md. */
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                    }}
                    /* oxlint-enable shadcn/no-inline-styles */
                    title={`${item.name}: ${occupied}/${item.capacity}`}
                    aria-current={selected ? "location" : undefined}
                  >
                    <div className="tw:font-semibold tw:text-sm">{item.name}</div>
                    <div className="tw:text-sm">
                      <Icon icon={UsersIcon} className="tw:me-1" />
                      {occupied}/{item.capacity}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
