import { describe, expect, it } from "vitest";

interface CreatedEdition {
  id: string;
  edition_type: string;
  active: boolean;
}

interface CreatedEvent {
  id: string;
  edition_id: string;
  date: string;
}

interface UpcomingEdition extends CreatedEdition {
  dates: string[];
  events: CreatedEvent[];
}

const ADMIN_HEADERS = {
  Authorization: "Bearer dev-token",
  "Content-Type": "application/json",
};

function dateFromToday(dayOffset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

async function createEdition(
  editionType: "bourse" | "capsule_exchange",
  active = true,
): Promise<CreatedEdition> {
  const response = await fetch("/api/editions", {
    method: "POST",
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ edition_type: editionType, active, dates: [] }),
  });

  expect(response.status).toBe(201);
  return (await response.json()) as CreatedEdition;
}

async function createEvent(editionId: string, date: string): Promise<CreatedEvent> {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      edition_id: editionId,
      title: `Community event ${date}`,
      description: "Shared event-store fixture",
      date,
      start_time: "10:00",
      category: "community",
      registration_required: false,
      active: true,
    }),
  });

  expect(response.status).toBe(201);
  return (await response.json()) as CreatedEvent;
}

async function fetchUpcoming(editionType: "bourse" | "capsule_exchange") {
  const response = await fetch(`/api/editions/upcoming?edition_type=${editionType}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as UpcomingEdition[];
}

describe("public upcoming-edition handler", () => {
  it("hydrates editions from the current shared event store", async () => {
    const edition = await createEdition("bourse");
    const event = await createEvent(edition.id, dateFromToday(1));

    const upcoming = await fetchUpcoming("bourse");
    const hydratedEdition = upcoming.find((item) => item.id === edition.id);

    expect(hydratedEdition?.dates).toEqual([event.date]);
    expect(hydratedEdition?.events.map((item) => item.id)).toEqual([event.id]);
  });

  it("sorts hydrated events chronologically", async () => {
    const edition = await createEdition("bourse");
    const laterEvent = await createEvent(edition.id, dateFromToday(2));
    const earlierEvent = await createEvent(edition.id, dateFromToday(1));

    const upcoming = await fetchUpcoming("bourse");
    const hydratedEdition = upcoming.find((item) => item.id === edition.id);

    expect(hydratedEdition?.events.map((item) => item.id)).toEqual([
      earlierEvent.id,
      laterEvent.id,
    ]);
  });

  it("filters by type, active state, and the latest shared event date", async () => {
    const currentEdition = await createEdition("bourse");
    const futureEdition = await createEdition("bourse");
    const pastEdition = await createEdition("bourse");
    const inactiveEdition = await createEdition("bourse", false);
    const emptyEdition = await createEdition("bourse");
    const otherTypeEdition = await createEdition("capsule_exchange");

    await Promise.all([
      createEvent(currentEdition.id, dateFromToday(0)),
      createEvent(futureEdition.id, dateFromToday(1)),
      createEvent(pastEdition.id, dateFromToday(-1)),
      createEvent(inactiveEdition.id, dateFromToday(1)),
      createEvent(otherTypeEdition.id, dateFromToday(1)),
    ]);

    const upcomingIds = new Set((await fetchUpcoming("bourse")).map((item) => item.id));

    expect(upcomingIds.has(currentEdition.id)).toBe(true);
    expect(upcomingIds.has(futureEdition.id)).toBe(true);
    expect(upcomingIds.has(pastEdition.id)).toBe(false);
    expect(upcomingIds.has(inactiveEdition.id)).toBe(false);
    expect(upcomingIds.has(emptyEdition.id)).toBe(false);
    expect(upcomingIds.has(otherTypeEdition.id)).toBe(false);
  });
});
