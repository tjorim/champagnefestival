import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { useAdminPeopleActions } from "@/hooks/useAdminPeopleActions";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { seedPeople } from "@/mocks/data/people";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer ".concat("mock-access-token"),
});

function useAdminPeople(isAuthenticated: boolean) {
  return useAdminQueries({
    visible: true,
    isAuthenticated,
    canManageAdminSections: true,
    authHeaders,
  });
}

describe("admin people collections in the admin hooks", () => {
  it("serves people from a collection, derives members from it, and drops both when the session ends", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const view = renderHook(({ isAuthenticated }) => useAdminPeople(isAuthenticated), {
      wrapper: Wrapper,
      initialProps: { isAuthenticated: true },
    });
    await waitFor(() => {
      expect(view.result.current.peopleQuery.data).toHaveLength(seedPeople.length);
      expect(view.result.current.membersQuery.data).toHaveLength(
        seedPeople.filter((p) => (p.roles as string[]).includes("member")).length,
      );
      expect(view.result.current.volunteersQuery.data).toHaveLength(
        seedPeople.filter((p) => (p.roles as string[]).includes("volunteer")).length,
      );
    });

    view.rerender({ isAuthenticated: false });

    await waitFor(() => {
      expect(view.result.current.peopleQuery.data).toHaveLength(0);
      expect(view.result.current.membersQuery.data).toHaveLength(0);
      expect(view.result.current.volunteersQuery.data).toHaveLength(0);
    });
    expect(queryClient.getQueryData(["admin", "people"])).toBeUndefined();
  });

  it("reflects a person update in people and members from one write", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const view = renderHook(
      () => {
        const queries = useAdminQueries({
          visible: true,
          isAuthenticated: true,
          canManageAdminSections: true,
          authHeaders,
        });
        const actions = useAdminPeopleActions({
          authHeaders,
          exhibitorsCollection: queries.exhibitorsCollection,
          peopleCollection: queries.peopleCollection,
          queryClient,
          registrationsQueryKey: queries.registrationsQueryKey,
          setDetailRegistration: () => undefined,
        });
        return { queries, actions };
      },
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(view.result.current.queries.membersQuery.data?.length).toBeGreaterThan(0),
    );
    // The refetch after the write would also return this; hold it back so the
    // assertions below prove the write itself reached both collections.
    server.use(
      http.get("/api/people", () =>
        HttpResponse.json({ items: [], total: 0, limit: 1000, page: 1 }, { status: 500 }),
      ),
    );

    await act(async () => {
      await view.result.current.actions.handleUpdatePerson("person-02", {
        name: "Bernard M.",
        email: "b.martin@bollinger.fr",
        phone: "+32471000002",
        address: "Avenue Louise 10, 1050 Brussels",
        roles: ["member"],
        notes: "",
        clubName: "Club Fizz",
        active: true,
      });
    });

    const named = (rows: { id: string; name: string }[] | undefined) =>
      rows?.find((row) => row.id === "person-02")?.name;
    expect(named(view.result.current.queries.peopleQuery.data)).toBe("Bernard M.");
    expect(named(view.result.current.queries.membersQuery.data)).toBe("Bernard M.");
  });
});
