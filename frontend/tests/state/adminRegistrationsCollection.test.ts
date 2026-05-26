import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { seedRegistrations } from "@/mocks/data/registrations";
import {
  createAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import { apiToRegistration } from "@/types/registrationMapper";

function createTestCollection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const collection = createAdminRegistrationsCollection({
    queryClient,
    authHeaders: () => ({ Authorization: "******" }),
    enabled: true,
  });
  return { collection, queryClient };
}

describe("admin registrations pilot collection", () => {
  it("loads registrations from the admin query source", async () => {
    const { collection, queryClient } = createTestCollection();
    await collection.preload();

    expect(collection.size).toBe(seedRegistrations.length);
    expect(collection.get("reg-01")?.tableId).toBe("table-01");

    queryClient.clear();
  });

  it("applies mutation updates for check-in, table assignment and cancellation", async () => {
    const { collection, queryClient } = createTestCollection();
    await collection.preload();

    const response = await fetch("/api/registrations/reg-01", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "******",
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

    queryClient.clear();
  });

  it("supports deletion and explicit reset behavior", async () => {
    const { collection, queryClient } = createTestCollection();
    await collection.preload();

    const deletionResponse = await fetch("/api/registrations/reg-03", {
      method: "DELETE",
      headers: { Authorization: "******" },
    });
    expect(deletionResponse.status).toBe(204);
    collection.utils.writeDelete("reg-03");
    expect(collection.has("reg-03")).toBe(false);

    resetAdminRegistrationsCollection(collection);
    expect(collection.size).toBe(0);

    queryClient.clear();
  });
});
