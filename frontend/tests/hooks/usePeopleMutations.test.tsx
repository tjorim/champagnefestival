import { act, renderHook, waitFor } from "@testing-library/react";
import { useIsMutating } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { usePeopleMutations } from "@/hooks/usePeopleMutations";
import { server } from "@/mocks/server";
import { captureAdminPeopleFence, resetAdminPeopleSession } from "@/state/adminPeopleSession";
import { apiToPerson } from "@/types/person";
import { fetchPeoplePage, type PeoplePage } from "@/utils/adminPeopleQueries";
import { queryKeys } from "@/utils/queryKeys";
import { createTestQueryClientHarness } from "../utils/queryClient";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer test-token",
});
const data = {
  name: "Updated",
  email: "",
  phone: "",
  address: "",
  roles: ["member"],
  clubName: "",
  notes: "",
  active: true,
};
const person = (id: string) => ({
  id,
  updated_at: "2026-01-01",
  ...data,
  name: `Original ${id}`,
  roles: ["member", "volunteer"],
  help_periods: [{ id: 1, first_help_day: "2026-10-01", last_help_day: null, notes: "" }],
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(resetAdminPeopleSession);
function harness() {
  const { queryClient, Wrapper } = createTestQueryClientHarness();
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
  let rows = [person("a"), person("b")];
  const params = { page: 1, limit: 20 };
  const key = queryKeys.admin.peopleList(params);
  const membersKey = queryKeys.admin.peopleList({ ...params, role: "member" });
  const page = (): PeoplePage => ({
    items: rows.map(apiToPerson),
    total: rows.length,
    page: 1,
    limit: 20,
  });
  for (const queryKey of [key, membersKey]) {
    queryClient.setQueryDefaults(queryKey, {
      queryFn: ({ signal }) => fetchPeoplePage(authHeaders, queryKey[3], signal),
    });
    queryClient.setQueryData(queryKey, page());
  }
  server.use(
    http.get("/api/people", ({ request }) => {
      const role = new URL(request.url).searchParams.get("role");
      const matching = rows.filter((row) => !role || row.roles.includes(role));
      return HttpResponse.json({ items: matching, total: matching.length, page: 1, limit: 20 });
    }),
  );
  const view = renderHook(
    () => ({
      ...usePeopleMutations({
        queryClient,
        authHeaders,
        registrationsQueryKey: ["admin", "registrations"],
      }),
      pending: useIsMutating({ mutationKey: ["admin", "people", "write"] }),
    }),
    { wrapper: Wrapper },
  );
  return {
    ...view,
    queryClient,
    key,
    membersKey,
    rows: () => rows,
    setRows: (next: typeof rows) => {
      rows = next;
    },
    cached: () => queryClient.getQueryData<PeoplePage>(key)!,
  };
}

describe("optimistic people mutations", () => {
  it("edits immediately with pending state and reconciles the server timestamp", async () => {
    const h = harness();
    const gate = deferred();
    server.use(
      http.put("/api/people/:id", async () => {
        await gate.promise;
        h.rows()[0] = { ...h.rows()[0]!, ...data, updated_at: "2026-10-06" };
        return HttpResponse.json({ ...h.rows()[0], updated_at: "2026-10-06" });
      }),
    );
    let promise!: Promise<unknown>;
    act(() => {
      promise = h.result.current.updatePersonMutation.mutateAsync({ id: "a", data });
    });
    await waitFor(() => expect(h.cached().items[0]?.name).toBe("Updated"));
    expect(h.result.current.pending).toBe(1);
    gate.resolve();
    await act(async () => {
      await promise;
    });
    expect(h.cached().items[0]?.name).toBe("Updated");
    expect(h.cached().items[0]?.updatedAt).toBe("2026-10-06");
    await waitFor(() => expect(h.result.current.pending).toBe(0));
  });

  it("removes a row leaving a role filter and lowers every cached page's total", async () => {
    const h = harness();
    const gate = deferred();
    const otherKey = queryKeys.admin.peopleList({ page: 2, limit: 20, role: "member" });
    h.queryClient.setQueryData(otherKey, { items: [], total: 2, page: 2, limit: 20 });
    server.use(
      http.put("/api/people/:id", async () => {
        await gate.promise;
        h.rows()[0]!.roles = [];
        return HttpResponse.json(h.rows()[0]);
      }),
    );
    let promise!: Promise<unknown>;
    act(() => {
      promise = h.result.current.updatePersonMutation.mutateAsync({
        id: "a",
        data: { ...data, roles: [] },
      });
    });
    await waitFor(() =>
      expect(h.queryClient.getQueryData<PeoplePage>(h.membersKey)?.total).toBe(1),
    );
    expect(h.queryClient.getQueryData<PeoplePage>(otherKey)?.total).toBe(1);
    gate.resolve();
    await act(async () => {
      await promise;
    });
  });

  it("deletes immediately and rolls back to the server's current row on refusal", async () => {
    const h = harness();
    const gate = deferred();
    server.use(
      http.delete("/api/people/:id", async () => {
        await gate.promise;
        h.rows()[0]!.name = "Changed elsewhere";
        return HttpResponse.json({ detail: "Refused" }, { status: 409 });
      }),
    );
    let promise!: Promise<unknown>;
    act(() => {
      promise = h.result.current.deletePersonMutation
        .mutateAsync("a")
        .catch((error: unknown) => error);
    });
    await waitFor(() => expect(h.cached().items.map((row) => row.id)).toEqual(["b"]));
    expect(h.cached().total).toBe(1);
    gate.resolve();
    await act(async () => {
      await promise;
    });
    expect(h.cached().items[0]?.name).toBe("Changed elsewhere");
    expect(h.cached().total).toBe(2);
  });

  it("restores the snapshot if both the write and reconciliation fail", async () => {
    const h = harness();
    server.use(
      http.put("/api/members/:id", () => HttpResponse.json({}, { status: 500 })),
      http.get("/api/people", () => HttpResponse.json({}, { status: 500 })),
    );
    await act(async () => {
      await h.result.current.updateMemberMutation
        .mutateAsync({ id: "a", data })
        .catch(() => undefined);
    });
    expect(h.cached().items[0]?.name).toBe("Original a");
  });

  it("preserves another person's pending edit through refusal and refetch", async () => {
    const h = harness();
    const a = deferred();
    const b = deferred();
    server.use(
      http.put("/api/people/:id", async ({ params }) => {
        await (params.id === "a" ? a.promise : b.promise);
        if (params.id === "a") return HttpResponse.json({}, { status: 409 });
        h.rows()[1]!.name = "Second edit";
        return HttpResponse.json(h.rows()[1]);
      }),
    );
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = h.result.current.updatePersonMutation
        .mutateAsync({ id: "a", data })
        .catch(() => undefined);
      second = h.result.current.updatePersonMutation.mutateAsync({
        id: "b",
        data: { ...data, name: "Second edit" },
      });
    });
    await waitFor(() => expect(h.cached().items[1]?.name).toBe("Second edit"));
    a.resolve();
    await act(async () => {
      await first;
    });
    expect(h.cached().items[0]?.name).toBe("Original a");
    expect(h.cached().items[1]?.name).toBe("Second edit");
    b.resolve();
    await act(async () => {
      await second;
    });
  });

  it("persists concurrent edits of the same person in order", async () => {
    const h = harness();
    const gate = deferred();
    const seen: string[] = [];
    server.use(
      http.put("/api/people/:id", async ({ request }) => {
        const body = (await request.json()) as typeof data;
        seen.push(body.name);
        if (seen.length === 1) await gate.promise;
        h.rows()[0]!.name = body.name;
        return HttpResponse.json(h.rows()[0]);
      }),
    );
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = h.result.current.updatePersonMutation.mutateAsync({ id: "a", data });
      second = h.result.current.updatePersonMutation.mutateAsync({
        id: "a",
        data: { ...data, name: "Latest" },
      });
    });
    await waitFor(() => expect(h.cached().items[0]?.name).toBe("Latest"));
    expect(seen).toEqual(["Updated"]);
    gate.resolve();
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(seen).toEqual(["Updated", "Latest"]);
    expect(h.cached().items[0]?.name).toBe("Latest");
  });

  it.each([true, false])(
    "drops a late %s response after sign-out and a replacement query",
    async (success) => {
      const h = harness();
      const gate = deferred();
      let requests = 0;
      server.use(
        http.put("/api/people/:id", async () => {
          requests++;
          await gate.promise;
          return HttpResponse.json(h.rows()[0], { status: success ? 200 : 409 });
        }),
      );
      let promise!: Promise<unknown>;
      act(() => {
        promise = h.result.current.updatePersonMutation
          .mutateAsync({ id: "a", data })
          .catch(() => undefined);
      });
      await waitFor(() => expect(requests).toBe(1));
      const fence = captureAdminPeopleFence();
      resetAdminPeopleSession();
      h.queryClient.removeQueries({ queryKey: queryKeys.admin.people });
      expect(fence()).toBe(false);
      const replacement = {
        items: [apiToPerson({ ...person("a"), name: "Next session" })],
        total: 1,
        page: 1,
        limit: 20,
      };
      h.queryClient.setQueryData(h.key, replacement);
      gate.resolve();
      await act(async () => {
        await promise;
      });
      expect(h.cached()).toEqual(replacement);
    },
  );

  it("removes only the volunteer role and periods from people pages", async () => {
    const h = harness();
    const gate = deferred();
    server.use(
      http.delete("/api/volunteers/:id", async () => {
        await gate.promise;
        h.rows()[0]!.roles = ["member"];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    let promise!: Promise<unknown>;
    act(() => {
      promise = h.result.current.deleteVolunteerMutation.mutateAsync("a");
    });
    await waitFor(() => expect(h.cached().items[0]?.roles).toEqual(["member"]));
    expect(h.cached().items[0]?.helpPeriods).toEqual([]);
    expect(h.cached().total).toBe(2);
    gate.resolve();
    await act(async () => {
      await promise;
    });
  });
});

it("keeps creates non-optimistic until the server assigns an id", async () => {
  const h = harness();
  const gate = deferred();
  let started = false;
  server.use(
    http.post("/api/people", async () => {
      started = true;
      await gate.promise;
      const created = person("c");
      h.setRows([...h.rows(), created]);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  let promise!: Promise<unknown>;
  act(() => {
    promise = h.result.current.createPersonMutation.mutateAsync(data);
  });
  await waitFor(() => expect(started).toBe(true));
  expect(h.cached().items).toHaveLength(2);
  gate.resolve();
  await act(async () => {
    await promise;
  });
  expect(h.queryClient.getQueryState(h.key)?.isInvalidated).toBe(true);
  await act(async () => {
    await h.queryClient.refetchQueries({ queryKey: h.key });
  });
  expect(h.cached().items.map((row) => row.id)).toEqual(["a", "b", "c"]);
});

it("does not send a queued same-person request after sign-out", async () => {
  const h = harness();
  const gate = deferred();
  let requests = 0;
  server.use(
    http.put("/api/people/:id", async () => {
      requests++;
      await gate.promise;
      return HttpResponse.json(h.rows()[0]);
    }),
  );
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = h.result.current.updatePersonMutation.mutateAsync({ id: "a", data });
    second = h.result.current.updatePersonMutation
      .mutateAsync({ id: "a", data: { ...data, name: "Queued" } })
      .catch(() => undefined);
  });
  await waitFor(() => expect(h.cached().items[0]?.name).toBe("Queued"));
  resetAdminPeopleSession();
  h.queryClient.removeQueries({ queryKey: queryKeys.admin.people });
  gate.resolve();
  await act(async () => {
    await Promise.all([first, second]);
  });
  expect(requests).toBe(1);
  expect(h.queryClient.getQueriesData({ queryKey: queryKeys.admin.people })).toEqual([]);
});

it("accepts the server state when an ambiguous failure actually committed", async () => {
  const h = harness();
  server.use(
    http.put("/api/people/:id", () => {
      h.rows()[0]!.name = "Committed elsewhere";
      return HttpResponse.json({}, { status: 500 });
    }),
  );
  await act(async () => {
    await h.result.current.updatePersonMutation
      .mutateAsync({ id: "a", data })
      .catch(() => undefined);
  });
  expect(h.cached().items[0]?.name).toBe("Committed elsewhere");
});

it("applies a pending edit to a page loaded during the request", async () => {
  const h = harness();
  const gate = deferred();
  server.use(
    http.put("/api/people/:id", async () => {
      await gate.promise;
      h.rows()[0]!.name = "Updated";
      return HttpResponse.json(h.rows()[0]);
    }),
  );
  let promise!: Promise<unknown>;
  act(() => {
    promise = h.result.current.updatePersonMutation.mutateAsync({ id: "a", data });
  });
  await waitFor(() => expect(h.cached().items[0]?.name).toBe("Updated"));
  const params = { page: 1, limit: 10, active: true };
  const key = queryKeys.admin.peopleList(params);
  await act(async () => {
    await h.queryClient.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => fetchPeoplePage(authHeaders, params, signal),
    });
  });
  expect(h.queryClient.getQueryData<PeoplePage>(key)?.items[0]?.name).toBe("Updated");
  gate.resolve();
  await act(async () => {
    await promise;
  });
});

it("does not lower totals for a different cached search", async () => {
  const h = harness();
  const gate = deferred();
  const key = queryKeys.admin.peopleList({ page: 1, limit: 20, q: "Original b" });
  h.queryClient.setQueryData(key, {
    items: [apiToPerson(person("b"))],
    total: 1,
    page: 1,
    limit: 20,
  });
  server.use(
    http.delete("/api/people/:id", async () => {
      await gate.promise;
      return HttpResponse.json({}, { status: 409 });
    }),
  );
  let promise!: Promise<unknown>;
  act(() => {
    promise = h.result.current.deletePersonMutation.mutateAsync("a").catch(() => undefined);
  });
  await waitFor(() => expect(h.cached().total).toBe(1));
  expect(h.queryClient.getQueryData<PeoplePage>(key)?.total).toBe(1);
  gate.resolve();
  await act(async () => {
    await promise;
  });
});
