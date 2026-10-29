import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { getCanvasSizePx, safeRoomColor } from "@/utils/layoutUtils";
import { fetchVenuePlanEditionChoices, venuePlanFailure } from "@/utils/venuePlanEditions";
import {
  type VenuePlanLayout,
  type VenuePlanTable,
  venuePlanQueryOptions,
} from "@/utils/venuePlanApi";

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
  const { edition, table, registration } = useSearch({ from: "/admin-layout/venue-plan" });
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
    <PlanExplorer
      key={`${edition}:${table ?? ""}`}
      layouts={query.data.layouts}
      linkedTable={table}
      registration={registration}
    />
  );
}

function tableStatus(table: VenuePlanTable) {
  const occupancy =
    table.occupied_seats > table.capacity
      ? m.venue_plan_over_capacity()
      : table.occupied_seats === table.capacity
        ? m.venue_plan_full()
        : table.occupied_seats > 0
          ? m.venue_plan_occupied()
          : m.venue_plan_available();
  return table.exclusive ? `${occupancy} · ${m.venue_plan_exclusive()}` : occupancy;
}

function PlanFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <Select value={value} onValueChange={(next) => onChange(next ?? "")} items={options}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue className="min-w-0 whitespace-normal break-words" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PlanExplorer({
  layouts,
  linkedTable,
  registration,
}: {
  layouts: VenuePlanLayout[];
  linkedTable?: string;
  registration?: string;
}) {
  const [search, setSearch] = useState("");
  const initialLayout = layouts.find((layout) =>
    layout.tables.some((item) => item.id === linkedTable),
  );
  const [room, setRoom] = useState(
    initialLayout ? (initialLayout.room?.id ?? initialLayout.id) : "",
  );
  const [event, setEvent] = useState(initialLayout?.event_id ?? "");
  const [date, setDate] = useState("");
  const [view, setView] = useState(initialLayout ? "map" : "list");
  const [selected, setSelected] = useState(linkedTable);
  const destination = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLDivElement>(null);
  const all = layouts.flatMap((layout) => layout.tables.map((item) => ({ layout, item })));
  const target = all.find(({ item }) => item.id === selected);
  const results = all.filter(
    ({ layout, item }) =>
      (!room || (layout.room?.id ?? layout.id) === room) &&
      (!event || layout.event_id === event) &&
      (!date || layout.date === date) &&
      item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const visibleLayouts = layouts.filter(
    (layout) =>
      (!room || (layout.room?.id ?? layout.id) === room) &&
      (!event || layout.event_id === event) &&
      (!date || layout.date === date),
  );
  useEffect(() => {
    if (selected) destination.current?.focus();
  }, [selected]);
  useEffect(() => {
    const marker = map.current?.querySelector<HTMLElement>('[aria-current="location"]');
    const scroller = marker?.parentElement?.parentElement;
    if (marker && scroller)
      scroller.scrollTo?.({
        left: marker.offsetLeft - scroller.clientWidth / 2,
        top: marker.offsetTop - scroller.clientHeight / 2,
      });
  }, [selected, view]);
  const choose = (id: string) => {
    const layout = all.find(({ item }) => item.id === id)?.layout;
    if (!layout) return;
    setRoom(layout.room?.id ?? layout.id);
    setEvent(layout.event_id);
    setDate(layout.date ?? "");
    setSelected(id);
    setView("map");
    setSearch("");
    if (id === selected) destination.current?.focus();
  };
  const options = (values: { value: string; label: string }[], label: string) => [
    { value: "", label },
    ...Array.from(new Map(values.map((value) => [value.value, value])).values()),
  ];
  return (
    <div id="venue-plan" className="site-container mx-auto w-full py-4">
      <ButtonLink
        render={<Link to="/check-in" search={{ id: registration }} />}
        variant="outline"
        className="mb-4 max-w-full whitespace-normal h-auto py-2"
      >
        {m.venue_plan_back_check_in()}
      </ButtonLink>
      <h1 className="text-2xl font-semibold">{m.venue_plan_title()}</h1>
      <p className="text-subtle">{m.venue_plan_description()}</p>
      <div className="grid gap-3 mb-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          {m.venue_plan_search()}
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <PlanFilter
          label={m.floor_plan_room()}
          value={room}
          onChange={setRoom}
          options={options(
            layouts.map((l) => ({ value: l.room?.id ?? l.id, label: l.room?.name ?? l.label })),
            m.venue_plan_all_rooms(),
          )}
        />
        <PlanFilter
          label={m.venue_plan_event()}
          value={event}
          onChange={setEvent}
          options={options(
            layouts.map((l) => ({ value: l.event_id, label: l.event_title })),
            m.venue_plan_all_events(),
          )}
        />
        <PlanFilter
          label={m.floor_plan_day()}
          value={date}
          onChange={setDate}
          options={options(
            layouts.filter((l) => l.date).map((l) => ({ value: l.date!, label: l.date! })),
            m.venue_plan_all_dates(),
          )}
        />
      </div>
      <ToggleGroup
        variant="outline"
        aria-label={m.venue_plan_view()}
        value={[view]}
        onValueChange={(values) => {
          if (values[0]) setView(values[0]);
        }}
      >
        <ToggleGroupItem
          className="aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background"
          value="list"
        >
          {m.venue_plan_list()}
        </ToggleGroupItem>
        <ToggleGroupItem
          className="aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background"
          value="map"
        >
          {m.venue_plan_map()}
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="text-sm">{m.venue_plan_legend()}</p>
      {selected && (
        <div
          ref={destination}
          tabIndex={-1}
          role="status"
          className="my-4 rounded-md border p-4 break-words focus-visible:outline-2 focus-visible:outline-ring"
        >
          {target ? (
            <>
              <h2 className="text-lg font-semibold">{target.item.name}</h2>
              <p>
                {target.layout.room?.name ?? target.layout.label} — {target.layout.event_title}{" "}
                {target.layout.date}
              </p>
              <p>
                {target.item.occupied_seats}/{target.item.capacity} · {tableStatus(target.item)}
              </p>
            </>
          ) : (
            m.venue_plan_table_missing()
          )}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-label={m.venue_plan_list()}
          className={
            view === "map" && !search ? "hidden lg:block" : view === "list" ? "lg:col-span-2" : ""
          }
        >
          <h2 className="text-lg font-semibold">{m.venue_plan_list()}</h2>
          {results.length === 0 && <p role="status">{m.venue_plan_no_results()}</p>}
          <ul className="list-none ps-0 grid gap-3 sm:grid-cols-2">
            {results.map(({ layout, item }) => (
              <li key={item.id} className="rounded-md border p-3 min-w-0 break-words">
                <h3 className="font-semibold">{item.name}</h3>
                <p>
                  {layout.room?.name ?? layout.label} — {layout.event_title} {layout.date}
                </p>
                <p>
                  {m.venue_plan_seats({ occupied: item.occupied_seats, capacity: item.capacity })} ·{" "}
                  {tableStatus(item)}
                </p>
                <Button
                  className="max-w-full whitespace-normal h-auto py-2"
                  variant="outline"
                  onClick={() => choose(item.id)}
                >
                  {m.venue_plan_show_table()}
                </Button>
              </li>
            ))}
          </ul>
        </section>
        {view === "map" && (
          <section ref={map} className="min-w-0" aria-label={m.venue_plan_map()}>
            <h2 className="text-lg font-semibold">{m.venue_plan_map()}</h2>
            <p>{m.venue_plan_map_help()}</p>
            {visibleLayouts.map((layout) => (
              <Card className="mb-6" key={layout.id}>
                <CardHeader className="flex justify-between">
                  <h3 className="font-semibold">
                    {layout.room?.name ?? layout.label} — {layout.event_title}
                  </h3>
                  {layout.date && <Badge variant="secondary">{layout.date}</Badge>}
                </CardHeader>
                <CardContent>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={layout.room?.name ?? layout.label}
                    className="max-h-96 overflow-auto rounded-md border p-12 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <div
                      data-slot="venue-plan-canvas"
                      className="relative w-full rounded-md border"
                      /* oxlint-disable shadcn/no-inline-styles -- Room aspect ratio and saved room color are per-layout data (docs/floor-plan-coordinates.md). */
                      style={{
                        aspectRatio: `${getCanvasSizePx(layout.room?.width_m ?? 20, layout.room?.length_m ?? 15).width} / ${getCanvasSizePx(layout.room?.width_m ?? 20, layout.room?.length_m ?? 15).height}`,
                        minWidth: Math.max(
                          960,
                          getCanvasSizePx(layout.room?.width_m ?? 20, layout.room?.length_m ?? 15)
                            .width,
                        ),
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
                        const highlighted = item.id === selected;
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
                            className={`absolute rounded-md border min-w-18 px-2 py-1 text-center ${highlighted ? "border-foreground bg-foreground text-background ring-2 ring-ring" : occupancyClass}`}
                            /* oxlint-disable shadcn/no-inline-styles -- Floor-plan x/y percentages and rotation per docs/floor-plan-coordinates.md. */
                            style={{
                              left: `${item.x}%`,
                              top: `${item.y}%`,
                              transform: `rotate(${item.rotation}deg)`,
                            }}
                            /* oxlint-enable shadcn/no-inline-styles */
                            title={`${item.name}: ${occupied}/${item.capacity} · ${tableStatus(item)}`}
                            aria-current={highlighted ? "location" : undefined}
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
