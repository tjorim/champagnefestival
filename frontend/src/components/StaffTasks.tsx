import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { ButtonLink } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

/** Role claims alone expose staff tools. Directory membership never grants access. */
export default function StaffTasks({
  expanded = false,
  editionId,
  editionLabel,
  pendingBookings,
}: {
  expanded?: boolean;
  editionId?: string;
  editionLabel?: string;
  pendingBookings?: { count?: number; loading: boolean; error: boolean; retry: () => void };
}) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const admin = auth.isAuthenticated && auth.hasRole("admin");
  const volunteer = auth.isAuthenticated && auth.hasRole("volunteer");
  if (!admin && !volunteer) return null;
  if (!expanded && !["/check-in", "/venue-plan", "/me"].includes(pathname)) return null;

  const edition = typeof search.edition === "string" ? search.edition : editionId;

  const link = (section: string, title: string) => (
    <ButtonLink
      key={section}
      variant="outline"
      className="h-auto min-h-10 whitespace-normal text-left justify-start"
      render={
        <Link to="/admin" search={{ ...(pathname === "/admin" ? search : {}), edition, section }} />
      }
    >
      {title}
    </ButtonLink>
  );
  return (
    <nav aria-label={m.workspace_title()} className="mb-6 rounded border border-border p-4">
      <h2 className="text-xl font-semibold mb-3">{m.workspace_title()}</h2>
      {expanded && editionLabel && <p className="font-medium mb-4">{editionLabel}</p>}
      <div className={expanded ? "grid gap-6 md:grid-cols-2" : "flex flex-wrap gap-3"}>
        <section>
          {expanded && <h3 className="font-semibold mb-3">{m.workspace_event_day()}</h3>}
          <div className="flex flex-wrap gap-2">
            {link("registrations", m.workspace_find_booking())}
            <ButtonLink variant="outline" render={<Link to="/check-in" search={{ edition }} />}>
              {m.workspace_scan()}
            </ButtonLink>
            <ButtonLink
              variant="outline"
              render={
                <Link
                  to="/venue-plan"
                  search={{
                    edition,
                    registration:
                      pathname === "/venue-plan" && typeof search.registration === "string"
                        ? search.registration
                        : undefined,
                    table:
                      pathname === "/venue-plan" && typeof search.table === "string"
                        ? search.table
                        : undefined,
                  }}
                />
              }
            >
              {m.workspace_seating()}
            </ButtonLink>
            {volunteer && (
              <ButtonLink
                variant="outline"
                render={<Link to="/me" search={{ tab: "volunteer", edition }} />}
              >
                {m.workspace_volunteer()}
              </ButtonLink>
            )}
            {!expanded && link("home", m.workspace_title())}
          </div>
        </section>
        {expanded && admin && (
          <>
            <section>
              <h3 className="font-semibold mb-3">{m.workspace_preparation()}</h3>
              <p className="text-sm text-subtle mb-3">{m.workspace_global()}</p>
              <div className="flex flex-wrap gap-2">
                {link("editions", m.admin_content_editions_section())}
                {link("people", m.admin_people_tab())}
                {link("venues", m.admin_venues_rooms_tab())}
                {link("floor-plans", m.admin_floor_plans_tab())}
              </div>
            </section>
            <section>
              <h3 className="font-semibold mb-3">{m.workspace_follow_up()}</h3>
              <p className="text-sm text-subtle mb-3">{m.workspace_follow_up_hint()}</p>
              {pendingBookings?.loading && <p role="status">{m.loading()}</p>}
              {pendingBookings?.error && (
                <LoadErrorAlert onRetry={pendingBookings.retry}>
                  {m.admin_error_load_dashboard()}
                </LoadErrorAlert>
              )}
              {!pendingBookings?.loading &&
                !pendingBookings?.error &&
                pendingBookings?.count !== undefined && (
                  <ButtonLink
                    variant="outline"
                    className="mb-3"
                    render={
                      <Link
                        to="/admin"
                        search={{
                          section: "registrations",
                          registrationStatus: "pending",
                          workQueue: "pending",
                        }}
                      />
                    }
                  >
                    {m.workspace_pending_bookings({ count: pendingBookings.count })}
                  </ButtonLink>
                )}
              <div className="flex flex-wrap gap-2">
                {link("waitlist", m.admin_waitlist_section())}
                {link("contact-messages", m.admin_contact_messages_section())}
                {link("scratchpad", m.admin_scratchpad_section())}
              </div>
            </section>
          </>
        )}
      </div>
    </nav>
  );
}
