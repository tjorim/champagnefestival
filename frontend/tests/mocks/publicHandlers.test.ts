import { describe, expect, it } from "vitest";

import type {
  EditionOut as CreatedEdition,
  EventOut as CreatedEvent,
  EditionPublicOut as UpcomingEdition,
} from "@/api-types";

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
  edition_type: "bourse" | "capsule_exchange",
  active = true,
): Promise<CreatedEdition> {
  const response = await fetch("/api/editions", {
    method: "POST",
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ edition_type: edition_type, active, dates: [] }),
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

async function fetchUpcoming(edition_type: "bourse" | "capsule_exchange") {
  const response = await fetch(`/api/editions/upcoming?edition_type=${edition_type}`);
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

it("serves public editions without admin inventory and hidden inclusion edges", async () => {
  const response = await fetch("/api/editions/active?edition_type=festival");
  const edition = (await response.json()) as UpcomingEdition;
  expect(edition).not.toHaveProperty("organizations");
  const tasting = edition.events.find((event) => event.id === "event-02");
  expect(tasting).toBeDefined();
  expect(tasting).not.toHaveProperty("edition");
  expect(tasting?.products.map((product) => product.id)).not.toContain("product-03");
  const bottle = tasting?.products.find((product) => product.id === "product-01");
  expect(bottle).not.toHaveProperty("stock");
  expect(bottle?.price).toBe("65");
  expect(bottle?.inclusions).toEqual([]);
});
