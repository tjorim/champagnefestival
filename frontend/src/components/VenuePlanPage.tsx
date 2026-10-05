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
      <div className="text-center p-12">
        <Spinner label={m.loading()} />
      </div>
    );
  if (query.isError) return <Alert variant="danger">{query.error.message}</Alert>;
  if (!query.data?.layouts.length) return <Alert variant="info">{m.venue_plan_empty()}</Alert>;

  return (
    <div className="site-container mx-auto w-full py-4">
      <p className="text-subtle">{m.venue_plan_description()}</p>
      {query.data.layouts.map((layout) => (
        <Card className="mb-6" key={layout.id}>
          <CardHeader className="flex justify-between">
            <strong>
              {layout.room?.name ?? layout.label} — {layout.event_title}
            </strong>
            {layout.date && <Badge variant="secondary">{layout.date}</Badge>}
          </CardHeader>
          <CardContent>
            <div
              data-slot="venue-plan-canvas"
              className="relative min-h-70 w-full overflow-hidden rounded-md border"
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
                  className="absolute text-subtle text-sm"
                  /* oxlint-disable shadcn/no-inline-styles -- Floor-plan x/y percentages and rotation per docs/floor-plan-coordinates.md. */
                  style={{
                    left: `${area.x}%`,
                    top: `${area.y}%`,
                    transform: `rotate(${area.rotation}deg)`,
                  }}
                  /* oxlint-enable shadcn/no-inline-styles */
                >
                  <AreaIcon name={area.icon} className="me-1" />
                  {area.label}
                </div>
              ))}
              {layout.tables.map((item) => {
                const selected = item.id === table;
                const occupied = item.occupied_seats;
                const occupancyClass =
                  occupied > item.capacity
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : item.exclusive || occupied === item.capacity
                      ? "border-warning bg-warning/10 text-highlight"
                      : occupied
                        ? "border-success bg-muted text-success"
                        : "border-subtle bg-muted text-foreground";
                return (
                  <div
                    key={item.id}
                    className={`absolute rounded-md border min-w-18 px-2 py-1 text-center ${selected ? "border-warning bg-warning text-contrast" : occupancyClass}`}
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
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-sm">
                      <Icon icon={UsersIcon} className="me-1" />
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
