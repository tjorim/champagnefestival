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

interface ApiUpcomingEdition {
  id: string;
  edition_type: "festival" | "bourse" | "capsule_exchange";
  external_partner?: string | null;
  external_contact_name?: string | null;
  external_contact_email?: string | null;
  venue?: { name?: string };
  events?: Record<string, unknown>[];
}

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

async function fetchCommunityEditions(): Promise<ApiUpcomingEdition[]> {
  const response = await fetch("/api/editions/upcoming?edition_type=bourse,capsule_exchange");
  if (!response.ok) {
    throw new Error(`Failed to load community events: ${response.status}`);
  }
  return (await response.json()) as ApiUpcomingEdition[];
}

export default function CommunityEvents() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["community-events"],
    queryFn: fetchCommunityEditions,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo<CommunityEventCardData[]>(() => {
    return data
      .map((edition) => {
        const event = (edition.events ?? []).map(apiToEvent)[0];
        if (!event) return null;

        return {
          id: edition.id,
          editionType: edition.edition_type,
          event,
          venueName: edition.venue?.name ?? "",
          externalPartner: edition.external_partner ?? undefined,
          externalContactName: edition.external_contact_name ?? undefined,
          externalContactEmail: edition.external_contact_email ?? undefined,
        };
      })
      .filter((entry): entry is CommunityEventCardData => entry !== null);
  }, [data]);

  return (
    <>
      <section id="community-events" className="content-section">
        <div className="container">
          <SectionHeading
            id="community-events-heading"
            title="Community Events"
            subtitle="Discover non-festival bourses and capsule exchanges."
          />

          <div className="row justify-content-center">
            <div className="col-md-10 col-lg-8">
              {isLoading && <p className="text-center">Loading community events…</p>}

              {isError && (
                <Alert variant="danger">Could not load community events right now. Please retry later.</Alert>
              )}

              {!isLoading && !isError && items.length === 0 && (
                <p className="text-center mb-0">No upcoming community events are currently scheduled.</p>
              )}

              {items.map((item) => (
                <Card key={item.id} className="mb-3 shadow-sm border-0">
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div>
                        <h5 className="mb-1">{getEditionTitle(item.editionType)}</h5>
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
                            Partner: {item.externalPartner}
                          </Badge>
                        )}

                        {item.externalContactName && item.externalContactEmail && (
                          <Alert variant="warning" className="py-2 mb-0">
                            <strong>Table reservations:</strong> {item.externalContactName} (
                            <a href={`mailto:${item.externalContactEmail}`}>{item.externalContactEmail}</a>)
                          </Alert>
                        )}
                      </div>

                      {item.event.registrationRequired && (
                        <Button variant="warning" onClick={() => setSelectedEvent(item.event)}>
                          RSVP
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
