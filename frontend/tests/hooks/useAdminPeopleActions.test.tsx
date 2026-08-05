/**
 * Merging people must not invent volunteer help periods in the cache.
 *
 * The merge endpoint used to let Postgres cascade-delete the duplicate's help
 * periods, and this hook hid it: it patched the duplicate's periods onto the
 * survivor, so the admin saw a correct-looking merge over a corrupted record.
 * The server transfers those rows now, and the cache must show what the server
 * says rather than a hopeful reconstruction of it.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useAdminPeopleActions } from "@/hooks/useAdminPeopleActions";
import { server } from "@/mocks/server";
import type { Person } from "@/types/person";
import { createTestQueryClientHarness } from "../utils/queryClient";

const PEOPLE_KEY = ["admin", "people"];
const MEMBERS_KEY = ["admin", "members"];
const REGISTRATIONS_KEY = ["admin", "registrations"];
const EXHIBITORS_KEY = ["admin", "exhibitors"];

function makePerson(overrides: Partial<Person> & { id: string }): Person {
  return {
    name: "Sofie De Smet",
    email: "",
    phone: "",
    address: "Dorpsstraat 12",
    roles: ["member"],
    nationalRegisterNumber: null,
    eidDocumentNumber: null,
    visitsPerMonth: null,
    clubName: "",
    notes: "",
    active: true,
    helpPeriods: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const CANONICAL = makePerson({
  id: "per_canonical",
  roles: ["member", "volunteer"],
  helpPeriods: [{ id: 1, firstHelpDay: "2024-03-15", lastHelpDay: "2024-03-17" }],
});

const DUPLICATE = makePerson({
  id: "per_duplicate",
  email: "sofie@example.com",
  roles: ["volunteer"],
  helpPeriods: [
    { id: 2, firstHelpDay: "2025-10-10", lastHelpDay: null },
    { id: 3, firstHelpDay: "2026-02-01", lastHelpDay: "2026-02-03" },
  ],
});

/** What POST /api/people/{id}/merge/{id} returns: a PersonOut, no help periods. */
const MERGE_RESPONSE = {
  id: CANONICAL.id,
  name: CANONICAL.name,
  email: "sofie@example.com",
  phone: "",
  address: CANONICAL.address,
  roles: ["member", "volunteer"],
  national_register_number: "91010112345",
  eid_document_number: "bex123456",
  visits_per_month: null,
  club_name: "",
  notes: "",
  active: true,
  created_at: CANONICAL.createdAt,
  updated_at: "2026-08-05T12:00:00Z",
};

function renderMergeHook(people: Person[]) {
  const { queryClient, Wrapper } = createTestQueryClientHarness();
  // Nothing observes these queries, and the harness defaults to gcTime 0, which
  // collects the seeded cache before the assertions can read it.
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
  // Keep the refetch out of the way: this is about what the hook writes itself.
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  queryClient.setQueryData<Person[]>(PEOPLE_KEY, people);

  const { result } = renderHook(
    () =>
      useAdminPeopleActions({
        authHeaders: () => ({ "Content-Type": "application/json" }),
        exhibitorsQueryKey: EXHIBITORS_KEY,
        membersQueryKey: MEMBERS_KEY,
        people,
        peopleQueryKey: PEOPLE_KEY,
        queryClient,
        registrationsQueryKey: REGISTRATIONS_KEY,
        setDetailRegistration: vi.fn(),
      }),
    { wrapper: Wrapper },
  );

  return { queryClient, result, invalidateQueries };
}

describe("useAdminPeopleActions — merge", () => {
  it("keeps the survivor's own help periods and does not adopt the duplicate's", async () => {
    server.use(
      http.post("/api/people/:canonicalId/merge/:duplicateId", () =>
        HttpResponse.json(MERGE_RESPONSE),
      ),
    );
    const { queryClient, result, invalidateQueries } = renderMergeHook([CANONICAL, DUPLICATE]);

    await act(async () => {
      await result.current.handleMergePeople(CANONICAL.id, DUPLICATE.id);
    });

    const people = queryClient.getQueryData<Person[]>(PEOPLE_KEY) ?? [];
    expect(people.map((person) => person.id)).toEqual([CANONICAL.id]);
    // The duplicate's two periods are transferred server-side; showing them here
    // before the refetch confirms it is exactly what masked the cascade delete.
    expect(people[0]?.helpPeriods).toEqual(CANONICAL.helpPeriods);
    // ...and the refetch that supplies the transferred periods is still queued.
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: PEOPLE_KEY });
    });
  });

  it("takes the merged field values from the server, not from the stale cache", async () => {
    server.use(
      http.post("/api/people/:canonicalId/merge/:duplicateId", () =>
        HttpResponse.json(MERGE_RESPONSE),
      ),
    );
    const { queryClient, result } = renderMergeHook([CANONICAL, DUPLICATE]);

    await act(async () => {
      await result.current.handleMergePeople(CANONICAL.id, DUPLICATE.id);
    });

    const survivor = (queryClient.getQueryData<Person[]>(PEOPLE_KEY) ?? [])[0];
    // The merge fills the canonical's blank email from the duplicate and adopts
    // its identity numbers; the cached blanks must not win.
    expect(survivor?.email).toBe("sofie@example.com");
    expect(survivor?.nationalRegisterNumber).toBe("91010112345");
    expect(survivor?.eidDocumentNumber).toBe("bex123456");
  });

  it("leaves help periods alone when the survivor is not a volunteer", async () => {
    const plainCanonical = makePerson({ id: "per_canonical" });
    const plainDuplicate = makePerson({ id: "per_duplicate" });
    server.use(
      http.post("/api/people/:canonicalId/merge/:duplicateId", () =>
        HttpResponse.json({ ...MERGE_RESPONSE, roles: ["member"] }),
      ),
    );
    const { queryClient, result } = renderMergeHook([plainCanonical, plainDuplicate]);

    await act(async () => {
      await result.current.handleMergePeople(plainCanonical.id, plainDuplicate.id);
    });

    const survivor = (queryClient.getQueryData<Person[]>(PEOPLE_KEY) ?? [])[0];
    expect(survivor?.roles).toEqual(["member"]);
    expect(survivor?.helpPeriods).toEqual([]);
  });
});
