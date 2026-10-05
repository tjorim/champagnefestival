/**
 * Spike for #1175: how should a server-driven admin table (the Members list)
 * load its pages? Two candidates run against the same fake paged server on the
 * installed versions (`@tanstack/db` 0.11.3, `@tanstack/query-db-collection`
 * 1.3.4, `@tanstack/react-query` 5.104):
 *
 * - TanStack DB `syncMode: "on-demand"` with a live query per page.
 * - TanStack Query with `placeholderData: keepPreviousData`.
 *
 * The assertions pin what was observed, and the decision lives in
 * `docs/decisions/tanstack-db.md`. If a version bump changes one of them, that
 * is a prompt to re-read the decision, not necessarily a bug.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createCollection, eq, ilike, useLiveQuery, type Collection } from "@tanstack/react-db";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { parseLoadSubsetOptions, queryCollectionOptions } from "@tanstack/query-db-collection";
import { createTestQueryClient, createTestQueryClientHarness } from "../utils/queryClient";

interface Member {
  id: string;
  name: string;
  phone: string;
  role: "member" | "volunteer";
  createdAt: number;
}

const BASE_KEY = ["admin", "people"] as const;

/** 25 people, newest first by `createdAt`; odd positions are members. */
function seedMembers(): Member[] {
  return Array.from({ length: 25 }, (_, index) => ({
    id: `p${String(index + 1).padStart(2, "0")}`,
    name: `Person ${index + 1}`,
    phone: `04${String(index + 1).padStart(2, "0")}`,
    role: index % 2 === 0 ? "volunteer" : "member",
    createdAt: 100 - index,
  }));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sleeps like a network round trip but rejects as soon as the request is aborted. */
function respond(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    });
  });
}

describe("on-demand collection sync (@tanstack/db 0.11.3, query-db-collection 1.3.4)", () => {
  interface Call {
    limit: number | undefined;
    offset: number | undefined;
    filterFields: string[];
    sortFields: string[];
    queryKey: readonly unknown[];
    ctxAborted: boolean;
    subsetAborted: boolean;
  }

  function createOnDemand({ delayMs = 0, search = false } = {}) {
    const queryClient = createTestQueryClient();
    const server = seedMembers();
    const calls: Call[] = [];
    const collection = createCollection(
      queryCollectionOptions<Member>({
        queryClient,
        queryKey: BASE_KEY,
        syncMode: "on-demand",
        retry: false,
        getKey: (member) => member.id,
        queryFn: async (context) => {
          const subset = context.meta?.loadSubsetOptions;
          const call: Call = {
            limit: subset?.limit,
            offset: subset?.offset,
            filterFields: [],
            sortFields: [],
            queryKey: context.queryKey,
            ctxAborted: false,
            subsetAborted: false,
          };
          calls.push(call);
          context.signal.addEventListener("abort", () => (call.ctxAborted = true));
          subset?.signal?.addEventListener("abort", () => (call.subsetAborted = true));

          // Throws on `or`, `like` and `ilike`; drops `offset`.
          const parsed = search ? undefined : parseLoadSubsetOptions(subset);
          call.filterFields = parsed?.filters.map((filter) => filter.field.join(".")) ?? [];
          call.sortFields = parsed?.sorts.map((sort) => sort.field.join(".")) ?? [];
          await respond(delayMs, context.signal);

          let rows = [...server];
          for (const filter of parsed?.filters ?? []) {
            if (filter.operator === "eq") {
              rows = rows.filter((row) => row[filter.field[0] as keyof Member] === filter.value);
            }
          }
          const sort = parsed?.sorts[0];
          if (sort) {
            const field = sort.field[0] as "createdAt";
            rows.sort((a, b) => (a[field] - b[field]) * (sort.direction === "desc" ? -1 : 1));
          }
          return (parsed?.limit === undefined ? rows : rows.slice(0, parsed.limit)).map((row) => ({
            ...row,
          }));
        },
      }),
    );
    return { collection, queryClient, server, calls };
  }

  type MemberCollection = Collection<Member, string>;

  const page = (collection: MemberCollection, pageIndex: number, role?: Member["role"]) =>
    useLiveQuery(
      (q) => {
        const base = q.from({ p: collection });
        const filtered = role ? base.where(({ p }) => eq(p.role, role)) : base;
        return filtered
          .orderBy(({ p }) => p.createdAt, "desc")
          .limit(5)
          .offset(pageIndex * 5);
      },
      [collection, pageIndex, role],
    );

  it("pushes sort and filter, but turns offset into a larger limit and adds a tie-break request", async () => {
    const { collection, calls } = createOnDemand();
    const { result, rerender } = renderHook(
      ({ pageIndex }) => page(collection as MemberCollection, pageIndex, "member"),
      { initialProps: { pageIndex: 0 } },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.data.map((row) => row.id)).toEqual(["p02", "p04", "p06", "p08", "p10"]);
    expect(calls[0]).toMatchObject({
      limit: 5,
      offset: undefined,
      filterFields: ["role"],
      sortFields: ["createdAt"],
    });
    // The second request has no limit and no sort: it loads every row that ties
    // with the last row's sort value, so the window boundary is exact.
    expect(calls[1]).toMatchObject({ limit: undefined, filterFields: ["role", "createdAt"] });

    rerender({ pageIndex: 2 });
    await waitFor(() => expect(result.current.data[0]?.id).toBe("p22"));
    // Page three asks the server for the first fifteen rows, not rows 11-15.
    expect(calls.some((call) => call.limit === 15 && call.offset === undefined)).toBe(true);
  });

  it("has no previous data while the next page loads", async () => {
    const { collection } = createOnDemand({ delayMs: 30 });
    const { result, rerender } = renderHook(
      ({ pageIndex }) => page(collection as MemberCollection, pageIndex),
      { initialProps: { pageIndex: 0 } },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.data).toHaveLength(5);

    rerender({ pageIndex: 1 });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.data[0]?.id).toBe("p06"));
  });

  it("aborts the superseded request when a filter changes", async () => {
    const { collection, calls } = createOnDemand({ delayMs: 60 });
    const { result, rerender } = renderHook(
      ({ role }) => page(collection as MemberCollection, 0, role),
      { initialProps: { role: "member" as Member["role"] } },
    );
    await act(async () => wait(10));

    rerender({ role: "volunteer" });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const [stale] = calls;
    expect(stale).toMatchObject({ ctxAborted: true, subsetAborted: true });
    expect(result.current.data.every((row) => row.role === "volunteer")).toBe(true);
  });

  it("fails loudly on a predicate parseLoadSubsetOptions cannot express", async () => {
    const { collection } = createOnDemand({ search: false });
    const { result } = renderHook(() =>
      useLiveQuery(
        (q) =>
          q
            .from({ p: collection as MemberCollection })
            .where(({ p }) => ilike(p.name, "%3%"))
            .orderBy(({ p }) => p.createdAt, "desc")
            .limit(5),
        [collection],
      ),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(String(collection.utils.lastError)).toMatch(/does not support 'ilike'/);
  });

  it("re-evaluates the pushed predicate on the client, so server-only search semantics disappear", async () => {
    // The people search endpoint matches name, email, phone, address, NISS,
    // notes and roles. A live query can only push `ilike(name, ...)`; a row the
    // server returned because of its phone number is dropped by the same
    // predicate locally.
    const queryClient = createTestQueryClient();
    const phoneOnlyMatch: Member = {
      id: "p99",
      name: "Someone Else",
      phone: "0477 Person",
      role: "member",
      createdAt: 1,
    };
    const collection = createCollection(
      queryCollectionOptions<Member>({
        queryClient,
        queryKey: BASE_KEY,
        syncMode: "on-demand",
        retry: false,
        getKey: (member) => member.id,
        queryFn: async () => [...seedMembers().slice(0, 1), phoneOnlyMatch],
      }),
    );
    const { result } = renderHook(() =>
      useLiveQuery(
        (q) =>
          q
            .from({ p: collection })
            .where(({ p }) => ilike(p.name, "%person%"))
            .orderBy(({ p }) => p.createdAt, "desc")
            .limit(5),
        [collection],
      ),
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(collection.has("p99")).toBe(true);
    expect(result.current.data.map((row) => row.id)).toEqual(["p01"]);
  });

  it("refetches active subsets after a direct write, so the server result wins", async () => {
    const { collection, calls } = createOnDemand();
    const { result } = renderHook(() => page(collection as MemberCollection, 0));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const before = calls.length;

    await collection.utils.writeUpsert({ id: "p01", name: "Renamed locally" });

    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(collection.get("p01")?.name).toBe("Person 1"));
  });

  it("is not emptied by the writeDelete reset the eager collections use", async () => {
    const { collection, queryClient, calls } = createOnDemand();
    const hook = renderHook(() => page(collection as MemberCollection, 0));
    await waitFor(() => expect(hook.result.current.isReady).toBe(true));
    expect(collection.size).toBe(5);

    // `createAdminCollectionLifecycle().reset` does exactly this.
    await collection.utils.writeBatch(() => {
      for (const key of collection.keys()) void collection.utils.writeDelete(key);
    });
    await act(async () => wait(30));
    expect(collection.size).toBe(5);

    // Sign-out has to drop the cached subsets and clean the collection up; a
    // new mount then loads again.
    hook.unmount();
    queryClient.removeQueries({ queryKey: BASE_KEY });
    await collection.cleanup();
    expect(collection.size).toBe(0);
    const requests = calls.length;
    const next = renderHook(() => page(collection as MemberCollection, 0));
    await waitFor(() => expect(next.result.current.isReady).toBe(true));
    expect(calls.length).toBeGreaterThan(requests);
  });

  it("keys each subset below the collection key, which no live-event envelope key equals", async () => {
    const { collection, queryClient } = createOnDemand();
    const { result } = renderHook(() => page(collection as MemberCollection, 0));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toHaveLength(BASE_KEY.length + 1);
      expect(key.slice(0, BASE_KEY.length)).toEqual([...BASE_KEY]);
      expect(typeof key[BASE_KEY.length]).toBe("string");
    }
  });
});

describe("TanStack Query with placeholderData: keepPreviousData", () => {
  interface MemberParams {
    page: number;
    role?: Member["role"];
    q?: string;
    sort: "createdAt" | "name";
    dir: "asc" | "desc";
  }

  function createServer(delayMs = 0) {
    const members = seedMembers();
    const requests: Array<{ params: MemberParams; aborted: boolean }> = [];
    async function fetchPage(params: MemberParams, signal: AbortSignal) {
      const request = { params, aborted: false };
      requests.push(request);
      signal.addEventListener("abort", () => (request.aborted = true));
      await respond(delayMs, signal);
      let rows = members.filter(
        (member) =>
          (!params.role || member.role === params.role) &&
          (!params.q ||
            member.name.toLowerCase().includes(params.q.toLowerCase()) ||
            member.phone.includes(params.q)),
      );
      rows = rows.sort((a, b) => {
        const order =
          a[params.sort] < b[params.sort] ? -1 : a[params.sort] > b[params.sort] ? 1 : 0;
        return params.dir === "desc" ? -order : order;
      });
      return {
        items: rows.slice(params.page * 5, params.page * 5 + 5),
        total: rows.length,
      };
    }
    return { fetchPage, requests, members };
  }

  function useMembersPage(
    fetchPage: ReturnType<typeof createServer>["fetchPage"],
    params: MemberParams,
  ) {
    return useQuery({
      queryKey: [...BASE_KEY, "list", params],
      queryFn: ({ signal }) => fetchPage(params, signal),
      placeholderData: keepPreviousData,
    });
  }

  it("serves page, sort, search and filter with the total in the same response", async () => {
    const { fetchPage } = createServer();
    const { Wrapper } = createTestQueryClientHarness();
    const { result, rerender } = renderHook(
      (params: MemberParams) => useMembersPage(fetchPage, params),
      { wrapper: Wrapper, initialProps: { page: 0, sort: "createdAt", dir: "desc" } },
    );

    await waitFor(() => expect(result.current.data?.items).toHaveLength(5));
    expect(result.current.data?.total).toBe(25);

    rerender({ page: 1, sort: "createdAt", dir: "desc" });
    // The previous page stays on screen while the next one loads.
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.items[0]?.id).toBe("p01");
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.items[0]?.id).toBe("p06");

    rerender({ page: 0, sort: "name", dir: "asc", role: "member" });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.total).toBe(12);
    expect(result.current.data?.items.every((member) => member.role === "member")).toBe(true);

    // A search the live-query predicate could not express: it matches a phone number.
    rerender({ page: 0, sort: "createdAt", dir: "desc", q: "0417" });
    await waitFor(() => expect(result.current.data?.total).toBe(1));
    expect(result.current.data?.items.map((member) => member.id)).toEqual(["p17"]);
  });

  it("cancels the in-flight request when a filter changes", async () => {
    const { fetchPage, requests } = createServer(60);
    const { Wrapper } = createTestQueryClientHarness();
    const { result, rerender } = renderHook(
      (params: MemberParams) => useMembersPage(fetchPage, params),
      { wrapper: Wrapper, initialProps: { page: 0, sort: "createdAt", dir: "desc", q: "1" } },
    );
    await act(async () => wait(10));

    rerender({ page: 0, sort: "createdAt", dir: "desc", q: "12" });
    await waitFor(() => expect(result.current.data?.total).toBe(1));

    // Only the abort-aware request is cancelled; TanStack Query does this
    // through `signal` without any collection code.
    expect(requests[0]).toMatchObject({ aborted: true });
    expect(result.current.data?.items.map((member) => member.id)).toEqual(["p12"]);
  });

  it("drops cached pages and cancels an in-flight request on sign-out", async () => {
    const { fetchPage, requests } = createServer(60);
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const loaded: MemberParams = { page: 0, sort: "createdAt", dir: "desc" };
    const loading: MemberParams = { page: 1, sort: "createdAt", dir: "desc" };
    const { result, rerender, unmount } = renderHook(
      (params: MemberParams) => useMembersPage(fetchPage, params),
      { wrapper: Wrapper, initialProps: loaded },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender(loading);
    await act(async () => wait(10));

    // Same call `useAdminQueries` makes when `isAuthenticated` turns false.
    await act(async () => {
      queryClient.removeQueries({ queryKey: BASE_KEY });
    });
    unmount();
    await wait(100);

    expect(requests[1]).toMatchObject({ aborted: true });
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("patches cached pages optimistically and reconciles with an invalidation", async () => {
    const { fetchPage, members } = createServer(10);
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const params: MemberParams = { page: 0, sort: "createdAt", dir: "desc", role: "member" };
    const { result } = renderHook(() => useMembersPage(fetchPage, params), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.items[0]?.id).toBe("p02"));

    // Optimistic edit: the row leaves the member filter in every cached page.
    const snapshot = queryClient.getQueriesData({ queryKey: [...BASE_KEY, "list"] });
    await act(async () => {
      queryClient.setQueriesData<{ items: Member[]; total: number }>(
        { queryKey: [...BASE_KEY, "list"] },
        (cached) =>
          cached && {
            items: cached.items.filter((member) => member.id !== "p02"),
            total: cached.total - 1,
          },
      );
    });
    await waitFor(() =>
      expect(result.current.data?.items.map((member) => member.id)).not.toContain("p02"),
    );
    expect(snapshot).toHaveLength(1);

    // A refused write restores the snapshot taken before the patch.
    await act(async () => {
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
    });
    await waitFor(() => expect(result.current.data?.items[0]?.id).toBe("p02"));

    // The server commit, then the invalidation brings back a full page.
    members.find((member) => member.id === "p02")!.role = "volunteer";
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: [...BASE_KEY, "list"] });
    });
    await waitFor(() =>
      expect(result.current.data?.items.map((member) => member.id)).toEqual([
        "p04",
        "p06",
        "p08",
        "p10",
        "p12",
      ]),
    );
  });
});
