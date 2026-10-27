import { AreaIcon } from "@/components/AreaIcon";
import { UsersIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { m } from "@/paraglide/messages";
import { safeRoomColor } from "@/utils/layoutUtils";
import { fetchVenuePlanEditionChoices, venuePlanFailure } from "@/utils/venuePlanEditions";
import { venuePlanQueryOptions } from "@/utils/venuePlanApi";

function Loading() {
  return (
    <div className="text-center p-12">
      <Spinner label={m.loading()} />
    </div>
  );
}

/** Sign-in guidance that returns to this exact plan, so the destination survives the IdP round trip. */
function SignInPrompt({ message, returnTo }: { message: string; returnTo: string }) {
  const auth = useAuth();
  return (
    <Alert variant="info" className="flex flex-wrap items-center justify-between gap-3">
      <span>{message}</span>
      <Button
        variant="outline-warning"
        size="sm"
        onClick={() => auth.login(returnTo)}
        disabled={auth.isSigningIn}
      >
        {auth.isSigningIn ? (
          <>
            <Spinner size="sm" className="me-2" aria-hidden="true" />
            {m.auth_signing_in()}
          </>
        ) : (
          m.admin_login_button()
        )}
      </Button>
    </Alert>
  );
}

/** Next step when no valid edition is open: pick one, or retry the list that offers them. */
function EditionPicker({ message, isAdmin }: { message: string; isAdmin: boolean }) {
  const auth = useAuth();
  const choices = useQuery({
    queryKey: ["venue-plan-editions", isAdmin],
    queryFn: () =>
      fetchVenuePlanEditionChoices(isAdmin, (): Record<string, string> => {
        const token = auth.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      }),
    retry: false,
  });

  return (
    <div className="site-container mx-auto w-full py-4">
      <Alert variant="warning">{message}</Alert>
      {choices.isPending && <Loading />}
      {choices.isError && (
        <LoadErrorAlert onRetry={() => void choices.refetch()} retrying={choices.isFetching}>
          {m.venue_plan_editions_error()}
        </LoadErrorAlert>
      )}
      {choices.data?.length === 0 && <Alert variant="info">{m.venue_plan_no_editions()}</Alert>}
      {choices.data && choices.data.length > 0 && (
        <nav aria-label={m.venue_plan_choose_edition()}>
          <p className="font-medium">{m.venue_plan_choose_edition()}</p>
          <ul className="flex flex-col items-start gap-2 ps-0 list-none">
            {choices.data.map((choice) => (
              <li key={choice.id}>
                <ButtonLink
                  render={<Link to="/venue-plan" search={{ edition: choice.id }} />}
                  variant="outline-warning"
                >
                  {choice.label}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** Signed in, but the account is neither a volunteer nor an admin: explain, and leave a way out. */
function NoAccess() {
  return (
    <div className="site-container mx-auto w-full py-4">
      <Alert variant="warning">{m.venue_plan_forbidden()}</Alert>
      <ButtonLink href="/" variant="outline">
        {m.back_to_site()}
      </ButtonLink>
    </div>
  );
}

export default function VenuePlanPage() {
  const auth = useAuth();
  const location = useLocation();
  const { edition, table } = useSearch({ from: "/admin-layout/venue-plan" });
  const returnTo = location.pathname + location.searchStr;
  const isAdmin = auth.hasRole("admin");
  const canView = auth.isAuthenticated && (isAdmin || auth.hasRole("volunteer"));
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
    enabled: Boolean(edition && canView),
  });

  if (auth.isLoading) return <Loading />;
  // Signed-out and unauthorised are not "no plan": say what is needed before looking at any data.
  if (!auth.isAuthenticated)
    return (
      <div className="site-container mx-auto w-full py-4">
        <SignInPrompt message={m.venue_plan_sign_in_required()} returnTo={returnTo} />
      </div>
    );
  if (!canView) return <NoAccess />;
  if (!edition) return <EditionPicker message={m.venue_plan_missing_edition()} isAdmin={isAdmin} />;
  if (query.isPending) return <Loading />;
  if (query.isError) {
    const failure = venuePlanFailure(query.error);
    if (failure === "expired")
      return (
        <div className="site-container mx-auto w-full py-4">
          <SignInPrompt message={m.venue_plan_session_expired()} returnTo={returnTo} />
        </div>
      );
    if (failure === "forbidden") return <NoAccess />;
    if (failure === "not-found")
      return <EditionPicker message={m.venue_plan_edition_not_found()} isAdmin={isAdmin} />;
    return (
      <div className="site-container mx-auto w-full py-4">
        <LoadErrorAlert onRetry={() => void query.refetch()} retrying={query.isFetching}>
          {m.venue_plan_error()}
        </LoadErrorAlert>
      </div>
    );
  }
  if (!query.data.layouts.length) return <Alert variant="info">{m.venue_plan_empty()}</Alert>;

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
