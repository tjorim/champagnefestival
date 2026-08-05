import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import SectionHeading from "@/components/SectionHeading";
import RegistrationModal from "@/components/RegistrationModal";
import type { Event } from "@/types/event";
import { apiToEvent } from "@/types/event";
import { m } from "@/paraglide/messages";

interface ApiUpcomingEdition {
  id: string;
  edition_type: "festival" | "bourse" | "capsule_exchange";
  venue: { name: string };
  co_organiser?: { name: string; website?: string } | null;
  events: Record<string, unknown>[];
}

const OTHER_EDITION_TYPES = ["bourse", "capsule_exchange"] as const;
type OtherEditionType = (typeof OTHER_EDITION_TYPES)[number];

const EDITION_TYPES = new Set<ApiUpcomingEdition["edition_type"]>([
  "festival",
  ...OTHER_EDITION_TYPES,
]);

interface OtherEventCardData {
  id: string;
  editionType: ApiUpcomingEdition["edition_type"];
  event: Event;
  venueName: string;
  /** The exhibitor who ran this edition with the vzw, credited on the card. */
  coOrganiserName?: string;
  coOrganiserWebsite?: string;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiEvent(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const requiredStrings = [
    "id",
    "edition_id",
    "title",
    "description",
    "date",
    "start_time",
    "category",
    "created_at",
    "updated_at",
  ];
  const endTimeIsValid =
    value.end_time === null || value.end_time === undefined || typeof value.end_time === "string";
  const registrationsOpenFromIsValid =
    value.registrations_open_from === null ||
    value.registrations_open_from === undefined ||
    typeof value.registrations_open_from === "string";
  const maxCapacityIsValid =
    value.max_capacity === null ||
    value.max_capacity === undefined ||
    typeof value.max_capacity === "number";

  return (
    requiredStrings.every((key) => typeof value[key] === "string") &&
    typeof value.registration_required === "boolean" &&
    typeof value.active === "boolean" &&
    endTimeIsValid &&
    registrationsOpenFromIsValid &&
    maxCapacityIsValid
  );
}

function parseUpcomingEditions(payload: unknown): ApiUpcomingEdition[] {
  if (!Array.isArray(payload)) {
    throw new Error("Upcoming editions response must be an array.");
  }

  return payload.map((value, index) => {
    const context = `upcoming editions[${index}]`;
    if (!isRecord(value)) throw new Error(`${context} must be an object.`);
    if (typeof value.id !== "string") throw new Error(`${context}.id must be a string.`);
    if (!EDITION_TYPES.has(value.edition_type as ApiUpcomingEdition["edition_type"])) {
      throw new Error(`${context}.edition_type is invalid.`);
    }

    const rawEvents = value.events;
    if (
      !Array.isArray(rawEvents) ||
      !rawEvents.every(isApiEvent) ||
      !rawEvents.every((event) => event.edition_id === value.id)
    ) {
      throw new Error(`${context}.events must contain valid events for this edition.`);
    }

    if (!isRecord(value.venue) || typeof value.venue.name !== "string") {
      throw new Error(`${context}.venue must be an object with a name.`);
    }
    const venue = { name: value.venue.name };

    // Optional and non-critical: a malformed co-organiser is dropped rather than
    // thrown, so one bad record can't hide every upcoming edition.
    const rawCoOrganiser = value.co_organiser;
    const coOrganiser =
      isRecord(rawCoOrganiser) && typeof rawCoOrganiser.name === "string"
        ? {
            name: rawCoOrganiser.name,
            website:
              typeof rawCoOrganiser.website === "string" && /^https?:\/\//.test(rawCoOrganiser.website)
                ? rawCoOrganiser.website
                : undefined,
          }
        : null;

    return {
      id: value.id,
      edition_type: value.edition_type as ApiUpcomingEdition["edition_type"],
      venue,
      co_organiser: coOrganiser,
      events: rawEvents,
    };
  });
}

async function fetchOtherEditionType(
  editionType: OtherEditionType,
): Promise<ApiUpcomingEdition[]> {
  const response = await fetch(`/api/editions/upcoming?edition_type=${editionType}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${editionType} other events: ${response.status}`);
  }

  const editions = parseUpcomingEditions(await response.json());
  return editions.filter((edition) => edition.edition_type === editionType);
}

async function fetchOtherEditions(): Promise<ApiUpcomingEdition[]> {
  const groupedEditions = await Promise.all(OTHER_EDITION_TYPES.map(fetchOtherEditionType));
  return groupedEditions.flat();
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

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["other-events"],
    queryFn: fetchOtherEditions,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo<OtherEventCardData[]>(() => {
    // Off-festival editions may hold multiple same-day events (opening, tasting, auction, ...).
    // Every active event is rendered as its own card; inactive (draft) events stay hidden.
    const cards = data.flatMap((edition): OtherEventCardData[] =>
      (edition.events ?? [])
        .map(apiToEvent)
        .filter((event) => event.active)
        .map((event) => ({
          id: event.id,
          editionType: edition.edition_type,
          event,
          venueName: edition.venue?.name ?? "",
          coOrganiserName: edition.co_organiser?.name || undefined,
          coOrganiserWebsite: edition.co_organiser?.website || undefined,
        })),
    );

    return cards.sort(
      (left, right) =>
        left.event.date.localeCompare(right.event.date) ||
        left.event.startTime.localeCompare(right.event.startTime),
    );
  }, [data]);

  return (
    <>
      <section id="other-events" className="content-section">
        <div className="container">
          <SectionHeading
            id="other-events-heading"
            title={m.other_events_title()}
            subtitle={m.other_events_subtitle()}
          />

          <div className="row justify-content-center">
            <div className="col-md-10 col-lg-8">
              {isLoading && <p className="text-center">{m.other_events_loading()}</p>}

              {isError && <Alert variant="danger">{m.other_events_error()}</Alert>}

              {!isLoading && !isError && items.length === 0 && (
                <p className="text-center mb-0">{m.other_events_empty()}</p>
              )}

              {items.map((item) => (
                <Card key={item.id} className="event-card mb-3 border-0">
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div>
                        <h5 className="mb-1">{getEditionTitle(item.editionType)}</h5>
                        <p className="mb-1 fw-semibold">{item.event.title}</p>
                        <p className="mb-1 text-muted">
                          <i className="bi bi-calendar-event me-2" aria-hidden="true" />
                          {formatDate(item.event.date)} • {item.event.startTime}
                        </p>
                        <p className="mb-1 text-muted">
                          <i className="bi bi-geo-alt me-2" aria-hidden="true" />
                          {item.venueName}
                        </p>
                        {item.coOrganiserName && (
                          <p className="mb-1 text-muted">
                            <i className="bi bi-people me-2" aria-hidden="true" />
                            {m.other_events_co_organised_with()}{" "}
                            {item.coOrganiserWebsite ? (
                              <a
                                href={item.coOrganiserWebsite}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.coOrganiserName}
                              </a>
                            ) : (
                              item.coOrganiserName
                            )}
                          </p>
                        )}
                        <p className="mb-2">{item.event.description}</p>


                      </div>

                      {(item.event.registrationRequired || item.event.products.length > 0) && (
                        <Button variant="warning" onClick={() => setSelectedEvent(item.event)}>
                          <i className="bi bi-calendar-check me-2" aria-hidden="true" />
                          {item.event.registrationRequired
                            ? item.editionType === "bourse"
                              ? m.other_events_reserve_table()
                              : m.other_events_rsvp()
                            : m.other_events_order()}
                        </Button>
                      )}
                    </div>
                  </Card.Body>
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
