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
import {
  createAdminPeopleCollection,
  resetAdminPeopleCollection,
} from "@/state/adminPeopleCollection";
import type { Person } from "@/types/person";
import { createTestQueryClientHarness } from "../utils/queryClient";

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
  helpPeriods: [{ id: 1, firstHelpDay: "2024-03-15", lastHelpDay: "2024-03-17", notes: "" }],
});

const DUPLICATE = makePerson({
  id: "per_duplicate",
  email: "sofie@example.com",
  roles: ["volunteer"],
  helpPeriods: [
    { id: 2, firstHelpDay: "2025-10-10", lastHelpDay: null, notes: "" },
    { id: 3, firstHelpDay: "2026-02-01", lastHelpDay: "2026-02-03", notes: "" },
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

function toApiPerson(person: Person) {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    address: person.address,
    roles: person.roles,
    national_register_number: person.nationalRegisterNumber,
    eid_document_number: person.eidDocumentNumber,
    visits_per_month: person.visitsPerMonth,
    club_name: person.clubName,
    notes: person.notes,
    active: person.active,
    created_at: person.createdAt,
    updated_at: person.updatedAt,
  };
}

async function renderMergeHook(people: Person[]) {
  const { queryClient, Wrapper } = createTestQueryClientHarness();
  // Nothing observes these queries, and the harness defaults to gcTime 0, which
  // collects the seeded cache before the assertions can read it.
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
  const volunteers = people.filter((person) => person.roles.includes("volunteer"));
  server.use(
    http.get("/api/people", () => {
      const items = people.map(toApiPerson);
      return HttpResponse.json({ items, total: items.length, limit: 1000, page: 1 });
    }),
    http.get("/api/volunteers", () =>
      HttpResponse.json({
        items: volunteers.map((person) => ({
          ...toApiPerson(person),
          help_periods: person.helpPeriods.map((period) => ({
            id: period.id,
            first_help_day: period.firstHelpDay,
            last_help_day: period.lastHelpDay,
            notes: period.notes,
          })),
        })),
        total: volunteers.length,
        limit: 1000,
        page: 1,
      }),
    ),
  );
  const peopleCollection = createAdminPeopleCollection({
    queryClient,
    authHeaders: () => ({ "Content-Type": "application/json" }),
    enabled: true,
  });
  await peopleCollection.preload();
  // Keep the refetch out of the way: this is about what the hook writes itself.
  const refetchPeople = vi
    .spyOn(peopleCollection.utils, "refetch")
    .mockResolvedValue(undefined as never);
  const setDetailRegistration = vi.fn();
  queryClient.setQueryData(REGISTRATIONS_KEY, [
    { id: "reg-1", personId: CANONICAL.id, person: { id: CANONICAL.id, name: "Before" } },
    { id: "reg-2", personId: DUPLICATE.id, person: { id: DUPLICATE.id, name: "Before" } },
  ]);
  queryClient.setQueryData(EXHIBITORS_KEY, [{ id: 1, contactPersonId: DUPLICATE.id }]);

  const { result } = renderHook(
    () =>
      useAdminPeopleActions({
        authHeaders: () => ({ "Content-Type": "application/json" }),
        exhibitorsQueryKey: EXHIBITORS_KEY,
        peopleCollection,
        queryClient,
        registrationsQueryKey: REGISTRATIONS_KEY,
        setDetailRegistration,
      }),
    { wrapper: Wrapper },
  );

  return { peopleCollection, queryClient, result, refetchPeople, setDetailRegistration };
}

describe("useAdminPeopleActions — merge", () => {
  it("keeps the survivor's own help periods and does not adopt the duplicate's", async () => {
    server.use(
      http.post("/api/people/:canonicalId/merge/:duplicateId", () =>
        HttpResponse.json(MERGE_RESPONSE),
      ),
    );
    const { peopleCollection, result, refetchPeople } = await renderMergeHook([
      CANONICAL,
      DUPLICATE,
    ]);

    await act(async () => {
      await result.current.handleMergePeople(CANONICAL.id, DUPLICATE.id);
    });

    const people = peopleCollection.toArray;
    expect(people.map((person) => person.id)).toEqual([CANONICAL.id]);
    // The duplicate's two periods are transferred server-side; showing them here
    // before the refetch confirms it is exactly what masked the cascade delete.
    expect(people[0]?.helpPeriods).toEqual(CANONICAL.helpPeriods);
    // ...and the refetch that supplies the transferred periods is still queued.
    await waitFor(() => {
      expect(refetchPeople).toHaveBeenCalled();
    });
  });

  it("takes the merged field values from the server, not from the stale cache", async () => {
    server.use(
      http.post("/api/people/:canonicalId/merge/:duplicateId", () =>
        HttpResponse.json(MERGE_RESPONSE),
      ),
    );
    const { peopleCollection, result } = await renderMergeHook([CANONICAL, DUPLICATE]);

    await act(async () => {
      await result.current.handleMergePeople(CANONICAL.id, DUPLICATE.id);
    });

    const survivor = peopleCollection.toArray[0];
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
    const { peopleCollection, result } = await renderMergeHook([plainCanonical, plainDuplicate]);

    await act(async () => {
      await result.current.handleMergePeople(plainCanonical.id, plainDuplicate.id);
    });

    const survivor = peopleCollection.toArray[0];
    expect(survivor?.roles).toEqual(["member"]);
    expect(survivor?.helpPeriods).toEqual([]);
  });
});

describe("useAdminPeopleActions — responses from an ended session", () => {
  /** Holds a response until the test releases it, so the session can end in between. */
  function gate() {
    let release: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => (release = resolve));
    return { opened, release };
  }

  it("does not patch the registrations or exhibitors caches with a stale merge response", async () => {
    const { opened, release } = gate();
    server.use(
      http.post("/api/people/:canonicalId/merge/:duplicateId", async () => {
        await opened;
        return HttpResponse.json(MERGE_RESPONSE);
      }),
    );
    const { peopleCollection, queryClient, result } = await renderMergeHook([CANONICAL, DUPLICATE]);

    let merge: Promise<void> = Promise.resolve();
    act(() => {
      merge = result.current.handleMergePeople(CANONICAL.id, DUPLICATE.id);
    });
    await resetAdminPeopleCollection(peopleCollection);
    release();
    await act(async () => {
      await merge;
    });

    const registrations = queryClient.getQueryData<{ personId: string }[]>(REGISTRATIONS_KEY);
    expect(registrations?.map((registration) => registration.personId)).toEqual([
      CANONICAL.id,
      DUPLICATE.id,
    ]);
    expect(queryClient.getQueryData(EXHIBITORS_KEY)).toEqual([
      { id: 1, contactPersonId: DUPLICATE.id },
    ]);
    expect(peopleCollection.size).toBe(0);
  });

  it("does not patch registration rows or the open detail with a stale person update", async () => {
    const { opened, release } = gate();
    server.use(
      http.put("/api/people/:id", async () => {
        await opened;
        return HttpResponse.json({ ...MERGE_RESPONSE, name: "Stale name" });
      }),
    );
    const { peopleCollection, queryClient, result, setDetailRegistration } = await renderMergeHook([
      CANONICAL,
      DUPLICATE,
    ]);

    let update: Promise<void> = Promise.resolve();
    act(() => {
      update = result.current.handleUpdatePerson(CANONICAL.id, {
        name: "Stale name",
        email: "",
        phone: "",
        address: "",
        roles: ["member"],
        notes: "",
        clubName: "",
        active: true,
      });
    });
    await resetAdminPeopleCollection(peopleCollection);
    release();
    await act(async () => {
      await update;
    });

    const registrations =
      queryClient.getQueryData<{ person: { name: string } }[]>(REGISTRATIONS_KEY);
    expect(registrations?.[0]?.person.name).toBe("Before");
    expect(setDetailRegistration).not.toHaveBeenCalled();
  });

  it("patches registration rows and the open detail with a current person update", async () => {
    server.use(
      http.put("/api/people/:id", () => HttpResponse.json({ ...MERGE_RESPONSE, name: "New name" })),
    );
    const { queryClient, result, setDetailRegistration } = await renderMergeHook([
      CANONICAL,
      DUPLICATE,
    ]);

    await act(async () => {
      await result.current.handleUpdatePerson(CANONICAL.id, {
        name: "New name",
        email: "",
        phone: "",
        address: "",
        roles: ["member"],
        notes: "",
        clubName: "",
        active: true,
      });
    });

    const registrations =
      queryClient.getQueryData<{ person: { name: string } }[]>(REGISTRATIONS_KEY);
    expect(registrations?.[0]?.person.name).toBe("New name");
    expect(setDetailRegistration).toHaveBeenCalled();
  });
});
