import { jsonResponse } from "@/mocks/response";
import { registrationOut } from "@/mocks/data/builders";
import type { RegistrationOut } from "@/api-types";
import { http } from "msw/http";
import { afterEach, describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { seedRegistrations } from "@/mocks/data/registrations";
import {
  canPatchAdminRegistrationLiveEvent,
  createAdminRegistrationsCollection,
  patchAdminRegistrationLiveEvent,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/lib/collections/adminRegistrationsCollection";
import { createTestQueryClient } from "../../utils/queryClient";

const TEST_AUTH_HEADERS = { Authorization: "Bearer ".concat("mock-access-token") };

function createTestCollection(editionId = "march-2026") {
  const queryClient = createTestQueryClient();
  const collection = createAdminRegistrationsCollection({
    queryClient,

    enabled: true,
    editionId,
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

  it("keeps an empty collection without requesting registrations when there is no active edition", async () => {
    const { collection, queryClient } = createTestCollection("");
    lastCollection = collection;
    lastQueryClient = queryClient;
    server.use(
      http.get("/api/registrations", () => {
        throw new Error("Unexpected unscoped load");
      }),
    );
    await collection.preload();
    expect(collection.size).toBe(0);
  });

  it("loads only the requested edition and ignores a historical live row", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    server.use(
      http.get("/api/registrations", ({ request }) => {
        expect(new URL(request.url).searchParams.get("edition_id")).toBe("march-2026");
        return jsonResponse<import("@/api-types").RegistrationListEnvelope>({
          items: [{ ...seedRegistrations[0]!, table_names: ["T1"] }],
          total: 1,
          page: 1,
          limit: 1000,
        });
      }),
    );
    await collection.preload();
    const unregister = registerAdminRegistrationsCollection(collection);
    try {
      server.use(
        http.get("/api/registrations/historical", () =>
          jsonResponse<import("@/api-types").RegistrationOutWithToken>({
            poll_question_id: null,
            stamp_progress: null,
            order_answers: [],
            booked_table_quantity: 0,
            allocations: [],
            person_id: "",
            person: { id: "", name: "", email: "", phone: "", preferred_language: null },
            event_id: "",
            guest_count: 0,
            order_items: [],
            notes: "",
            table_id: null,
            status: "pending",
            payment_status: "unpaid",
            amount_due: null,
            amount_paid: "0",
            refund_due: "0",
            checked_in: false,
            checked_in_at: null,
            strap_issued: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            check_in_token: "",
            ...seedRegistrations[0],
            id: "historical",
            event: { ...seedRegistrations[0]!.event, edition_id: "older" },
          }),
        ),
      );
      await patchAdminRegistrationLiveEvent({
        topic: "registration",
        action: "created",
        scope: {
          edition_id: "older",
          event_id: null,
          registration_id: "historical",
          table_id: null,
        },
        keys: [["admin", "registrations"]],
        ts: "2026-10-07T10:00:00Z",
        id: "historical-event",
      });
      expect(collection.has("historical")).toBe(false);
      expect(collection.size).toBe(1);
    } finally {
      unregister();
    }
  });

  it("loads registrations from the admin query source", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    await collection.preload();

    expect(collection.size).toBe(seedRegistrations.length);
    expect(collection.get("reg-01")?.table_id).toBe("table-01");
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
        allocations: [{ table_id: "table-03", guest_count: 2, exclusive: false }],
        status: "cancelled",
      }),
    });
    expect(response.ok).toBe(true);
    const updated = (await response.json()) as RegistrationOut;
    collection.utils.writeUpsert(updated);

    const registration = collection.get("reg-01");
    expect(registration?.checked_in).toBe(true);
    expect(registration?.table_id).toBeNull();
    expect(registration?.allocations).toEqual([]);
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

      await patchAdminRegistrationLiveEvent({
        topic: "registration",
        action: "updated",
        scope: { edition_id: null, event_id: null, registration_id: "reg-01", table_id: null },
        keys: [["admin", "registrations"]],
        ts: "2026-05-28T18:00:00Z",
        id: "evt-live-update",
      });

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
      await patchAdminRegistrationLiveEvent({
        topic: "registration",
        action: "deleted",
        scope: { edition_id: null, event_id: null, registration_id: "reg-03", table_id: null },
        keys: [["admin", "registrations"]],
        ts: "2026-05-28T18:00:00Z",
        id: "evt-live-delete",
      });

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

  it("discards a fetched registration when the collection is reset while the fetch is in flight", async () => {
    const { collection, queryClient } = createTestCollection();
    lastQueryClient = queryClient;
    await collection.preload();
    const unregister = registerAdminRegistrationsCollection(collection);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/registrations/:id", async () => {
        await gate;
        return jsonResponse<import("@/api-types").RegistrationOutWithToken>(
          registrationOut({ id: "reg-01", notes: "Late response" }),
        );
      }),
    );

    try {
      const patch = patchAdminRegistrationLiveEvent({
        topic: "registration",
        action: "updated",
        scope: { edition_id: null, event_id: null, registration_id: "reg-01", table_id: null },
        keys: [["admin", "registrations"]],
        ts: "2026-05-28T18:00:00Z",
        id: "evt-late",
      });
      await resetAdminRegistrationsCollection(collection);
      expect(collection.size).toBe(0);

      release();
      await patch;

      expect(collection.size).toBe(0);
    } finally {
      unregister();
    }
  });

  it("tolerates a live delete for a registration the collection no longer holds", async () => {
    const { collection, queryClient } = createTestCollection();
    lastCollection = collection;
    lastQueryClient = queryClient;
    await collection.preload();
    await collection.utils.writeDelete("reg-03");
    const unregister = registerAdminRegistrationsCollection(collection);

    try {
      await expect(
        patchAdminRegistrationLiveEvent({
          topic: "registration",
          action: "deleted",
          scope: { edition_id: null, event_id: null, registration_id: "reg-03", table_id: null },
          keys: [["admin", "registrations"]],
          ts: "2026-05-28T18:00:01Z",
          id: "evt-gone",
        }),
      ).resolves.toBeUndefined();
    } finally {
      unregister();
    }
  });
});
