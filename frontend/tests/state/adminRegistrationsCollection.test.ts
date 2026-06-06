import { afterEach, describe, expect, it } from "vitest";
import { seedRegistrations } from "@/mocks/data/registrations";
import {
  canPatchAdminRegistrationLiveEvent,
  createAdminRegistrationsCollection,
  patchAdminRegistrationLiveEvent,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import { apiToRegistration } from "@/types/registrationMapper";
import { createTestQueryClient } from "../utils/queryClient";

const TEST_AUTH_HEADERS = { Authorization: "Bearer ".concat("mock-access-token") };

function createTestCollection() {
  const queryClient = createTestQueryClient();
  const collection = createAdminRegistrationsCollection({
    queryClient,
    authHeaders: () => TEST_AUTH_HEADERS,
    enabled: true,
  });
  return { collection, queryClient };
}

describe("admin registrations pilot collection", () => {
  let lastCollection: ReturnType<typeof createAdminRegistrationsCollection> | null = null;
  let lastQueryClient: ReturnType<typeof createTestQueryClient> | null = null;

  afterEach(() => {
    if (lastCollection) resetAdminRegistrationsCollection(lastCollection);
    if (lastQueryClient) lastQueryClient.clear();
    lastCollection = null;
    lastQueryClient = null;
  });

  it("loads registrations from the admin query source", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    await collection.preload();

    expect(collection.size).toBe(seedRegistrations.length);
    expect(collection.get("reg-01")?.tableId).toBe("table-01");
  });

  it("applies mutation updates for check-in, table assignment and cancellation", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    await collection.preload();

    const response = await fetch("/api/registrations/reg-01", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...TEST_AUTH_HEADERS,
      },
      body: JSON.stringify({
        checked_in: true,
        checked_in_at: "2026-03-07T12:30:00Z",
        table_id: "table-03",
        status: "cancelled",
      }),
    });
    expect(response.ok).toBe(true);
    const updated = apiToRegistration((await response.json()) as Record<string, unknown>);
    collection.utils.writeUpsert(updated);

    const registration = collection.get("reg-01");
    expect(registration?.checkedIn).toBe(true);
    expect(registration?.tableId).toBe("table-03");
    expect(registration?.status).toBe("cancelled");
  });

  it("applies live registration updates without reloading the full list", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    await collection.preload();

    const unregister = registerAdminRegistrationsCollection(collection);
    try {
      expect(
        canPatchAdminRegistrationLiveEvent({
          topic: "registration",
          action: "updated",
          scope: { edition_id: null, event_id: null, registration_id: "reg-01", table_id: null },
          keys: [["admin", "registrations"]],
          ts: "2026-05-28T18:00:00Z",
          id: "evt-live-update",
        }),
      ).toBe(true);

      await fetch("/api/registrations/reg-01", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...TEST_AUTH_HEADERS,
        },
        body: JSON.stringify({ notes: "Live update note" }),
      });

      await patchAdminRegistrationLiveEvent(
        {
          topic: "registration",
          action: "updated",
          scope: { edition_id: null, event_id: null, registration_id: "reg-01", table_id: null },
          keys: [["admin", "registrations"]],
          ts: "2026-05-28T18:00:00Z",
          id: "evt-live-update",
        },
        () => TEST_AUTH_HEADERS,
      );

      expect(collection.get("reg-01")?.notes).toBe("Live update note");
      expect(collection.size).toBe(seedRegistrations.length);
    } finally {
      unregister();
    }
  });

  it("applies live registration deletes from the event envelope", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    await collection.preload();

    const unregister = registerAdminRegistrationsCollection(collection);
    try {
      await patchAdminRegistrationLiveEvent(
        {
          topic: "registration",
          action: "deleted",
          scope: { edition_id: null, event_id: null, registration_id: "reg-03", table_id: null },
          keys: [["admin", "registrations"]],
          ts: "2026-05-28T18:00:00Z",
          id: "evt-live-delete",
        },
        () => TEST_AUTH_HEADERS,
      );

      expect(collection.has("reg-03")).toBe(false);
    } finally {
      unregister();
    }
  });

  it("supports deletion and explicit reset behavior", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    await collection.preload();

    const deletionResponse = await fetch("/api/registrations/reg-03", {
      method: "DELETE",
      headers: TEST_AUTH_HEADERS,
    });
    expect(deletionResponse.status).toBe(204);
    collection.utils.writeDelete("reg-03");
    expect(collection.has("reg-03")).toBe(false);

    resetAdminRegistrationsCollection(collection);
    lastCollection = null;
    expect(collection.size).toBe(0);
  });
});
