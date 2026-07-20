import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "react-bootstrap/Card";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import SectionHeading from "@/components/SectionHeading";
import RegistrationModal from "@/components/RegistrationModal";
import type { Event } from "@/types/event";
import { apiToEvent } from "@/types/event";
import { m } from "@/paraglide/messages";
import { COMMUNITY_CONTACT_EMAIL_REGEX } from "@/config/constants";

interface ApiUpcomingEdition {
  id: string;
  edition_type: "festival" | "bourse" | "capsule_exchange";
  external_partner?: string | null;
  external_contact_name?: string | null;
  external_contact_email?: string | null;
  venue: { name: string };
  events: Record<string, unknown>[];
}

const COMMUNITY_EDITION_TYPES = ["bourse", "capsule_exchange"] as const;
type CommunityEditionType = (typeof COMMUNITY_EDITION_TYPES)[number];

const EDITION_TYPES = new Set<ApiUpcomingEdition["edition_type"]>([
  "festival",
  ...COMMUNITY_EDITION_TYPES,
]);

interface CommunityEventCardData {
  id: string;
  editionType: ApiUpcomingEdition["edition_type"];
  event: Event;
  venueName: string;
  externalPartner?: string;
  externalContactName?: string;
  externalContactEmail?: string;
}

function getEditionTitle(editionType: ApiUpcomingEdition["edition_type"]) {
  switch (editionType) {
    case "bourse":
      return "Community Bourse";
    case "capsule_exchange":
      return "Capsule Exchange";
    default:
      return "Community Event";
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

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = record[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${context}.${key} must be a string or null.`);
  }
  return value;
}

/**
 * Unlike readOptionalString's siblings, an invalid value here is dropped rather
 * than thrown: a malformed contact address on one edition must not take down
 * the entire community events response and hide unrelated editions/events. This
 * checks the type directly instead of delegating to readOptionalString, since
 * that helper throws on a non-string value — which would defeat the point.
 */
function readOptionalEmail(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = record[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" || !COMMUNITY_CONTACT_EMAIL_REGEX.test(value)) {
    console.warn(`${context}.${key} is not a valid, safe email address; omitting it.`);
    return undefined;
  }
  return value;
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

    return {
      id: value.id,
      edition_type: value.edition_type as ApiUpcomingEdition["edition_type"],
      external_partner: readOptionalString(value, "external_partner", context),
      external_contact_name: readOptionalString(value, "external_contact_name", context),
      external_contact_email: readOptionalEmail(value, "external_contact_email", context),
      venue,
      events: rawEvents,
    };
  });
}

async function fetchCommunityEditionType(
  editionType: CommunityEditionType,
): Promise<ApiUpcomingEdition[]> {
  const response = await fetch(`/api/editions/upcoming?edition_type=${editionType}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${editionType} community events: ${response.status}`);
  }

  const editions = parseUpcomingEditions(await response.json());
  return editions.filter((edition) => edition.edition_type === editionType);
}

async function fetchCommunityEditions(): Promise<ApiUpcomingEdition[]> {
  const groupedEditions = await Promise.all(COMMUNITY_EDITION_TYPES.map(fetchCommunityEditionType));
  return groupedEditions.flat();
}

export default function CommunityEvents() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["community-events"],
    queryFn: fetchCommunityEditions,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo<CommunityEventCardData[]>(() => {
    // Community editions may hold multiple same-day events (opening, tasting, auction, ...).
    // Every active event is rendered as its own card; inactive (draft) events stay hidden.
    const cards = data.flatMap((edition): CommunityEventCardData[] =>
      (edition.events ?? [])
        .map(apiToEvent)
        .filter((event) => event.active)
        .map((event) => ({
          id: event.id,
          editionType: edition.edition_type,
          event,
          venueName: edition.venue?.name ?? "",
          externalPartner: edition.external_partner ?? undefined,
          externalContactName: edition.external_contact_name ?? undefined,
          externalContactEmail: edition.external_contact_email ?? undefined,
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
      <section id="community-events" className="content-section">
        <div className="container">
          <SectionHeading
            id="community-events-heading"
            title={m.community_events_title()}
            subtitle={m.community_events_subtitle()}
          />

          <div className="row justify-content-center">
            <div className="col-md-10 col-lg-8">
              {isLoading && <p className="text-center">{m.community_events_loading()}</p>}

              {isError && <Alert variant="danger">{m.community_events_error()}</Alert>}

              {!isLoading && !isError && items.length === 0 && (
                <p className="text-center mb-0">{m.community_events_empty()}</p>
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
                        <p className="mb-2">{item.event.description}</p>

                        {item.externalPartner && (
                          <Badge bg="secondary" className="mb-2">
                            {m.community_events_partner({ partner: item.externalPartner })}
                          </Badge>
                        )}

                        {item.externalContactName && item.externalContactEmail && (
                          <Alert variant="warning" className="py-2 mb-0">
                            <strong>{m.community_events_table_reservations()}</strong>{" "}
                            {item.externalContactName} (
                            <a href={`mailto:${item.externalContactEmail}`}>
                              {item.externalContactEmail}
                            </a>
                            )
                          </Alert>
                        )}
                      </div>

                      {item.event.registrationRequired && (
                        <Button variant="warning" onClick={() => setSelectedEvent(item.event)}>
                          {m.community_events_rsvp()}
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
