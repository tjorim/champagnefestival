import { CalendarCheckIcon, CalendarDaysIcon, MapPinIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import SectionHeading from "@/components/SectionHeading";
import RegistrationModal from "@/components/RegistrationModal";
import type { Event } from "@/types/event";
import { type ApiUpcomingEdition, useOtherEventItems } from "@/hooks/useOtherEvents";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { eventDescription, eventTitle } from "@/utils/eventText";

function getEditionTitle(editionType: ApiUpcomingEdition["edition_type"]) {
  switch (editionType) {
    case "bourse":
      return m.other_events_type_bourse();
    case "capsule_exchange":
      return m.other_events_type_capsule_exchange();
    default:
      return m.other_events_type_other();
  }
}

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/**
 * The section used to live at `#community-events`. Existing bookmarks and any
 * links already shared keep that fragment, so map it onto the new anchor rather
 * than dropping people at the top of the page.
 */
function useLegacyAnchorRedirect() {
  useEffect(() => {
    if (window.location.hash !== "#community-events") return;
    window.history.replaceState(null, "", "#other-events");
    document.getElementById("other-events")?.scrollIntoView();
  }, []);
}

export default function OtherEvents() {
  useLegacyAnchorRedirect();
  const locale = getLocale();

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const { items, isLoading, isError } = useOtherEventItems();

  useEffect(() => {
    const nextDeadline = items
      .map((item) => item.event.registrationsCloseAt)
      .filter((deadline): deadline is string => Boolean(deadline))
      .map((deadline) => new Date(deadline).getTime())
      .filter((deadline) => Number.isFinite(deadline) && deadline > now)
      .sort((left, right) => left - right)[0];
    if (nextDeadline === undefined) return;

    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(nextDeadline - now + 50, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [items, now]);

  // Nothing upcoming: leave the section (and its navigation link) out instead of an empty block.
  if (!isLoading && !isError && items.length === 0) return null;

  return (
    <>
      <section id="other-events" className="content-section">
        <div className="site-container mx-auto w-full">
          <SectionHeading
            id="other-events-heading"
            title={m.other_events_title()}
            subtitle={m.other_events_subtitle()}
          />

          <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center riviera:justify-start">
            <div className="site-content-column site-md:w-content-md site-lg:w-content-lg">
              {isLoading && <p className="text-center">{m.other_events_loading()}</p>}

              {isError && <Alert variant="danger">{m.other_events_error()}</Alert>}

              {!isLoading && !isError && items.length === 0 && (
                <p className="text-center mb-0">{m.other_events_empty()}</p>
              )}

              {items.map((item) => (
                <Card key={item.id} className="event-card mb-4 border-0">
                  <CardContent>
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div>
                        <h5 className="mb-1">{getEditionTitle(item.editionType)}</h5>
                        <p className="mb-1 font-semibold">{eventTitle(item.event, locale)}</p>
                        <p className="mb-1 text-subtle">
                          <Icon icon={CalendarDaysIcon} className="me-2" />
                          {formatDate(item.event.date)} • {item.event.startTime}
                        </p>
                        <p className="mb-1 text-subtle">
                          <Icon icon={MapPinIcon} className="me-2" />
                          {item.venueName}
                        </p>
                        {item.coOrganizerName && (
                          <p className="mb-1 text-subtle">
                            <Icon icon={UsersIcon} className="me-2" />
                            {m.other_events_co_organized_with()}{" "}
                            {item.coOrganizerWebsite ? (
                              <a
                                href={item.coOrganizerWebsite}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.coOrganizerName}
                              </a>
                            ) : (
                              item.coOrganizerName
                            )}
                          </p>
                        )}
                        <p className="mb-2">{eventDescription(item.event, locale)}</p>
                      </div>

                      {(item.event.registrationRequired || item.event.products.length > 0) && (
                        <Button
                          variant="warning"
                          disabled={Boolean(
                            item.event.registrationsCloseAt &&
                            new Date(item.event.registrationsCloseAt).getTime() <= now,
                          )}
                          onClick={() => setSelectedEvent(item.event)}
                        >
                          <Icon icon={CalendarCheckIcon} />
                          {item.event.registrationsCloseAt &&
                          new Date(item.event.registrationsCloseAt).getTime() <= now
                            ? m.registration_closed()
                            : item.event.registrationRequired
                              ? item.editionType === "bourse"
                                ? m.other_events_reserve_table()
                                : m.other_events_rsvp()
                              : m.other_events_order()}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <RegistrationModal
        show={Boolean(selectedEvent)}
        onHide={() => setSelectedEvent(null)}
        event={selectedEvent}
      />
    </>
  );
}
