import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePeopleCountsQuery, usePeopleListQuery } from "@/hooks/usePeopleListQuery";
import { peopleListSearchParams, type PeopleListParams } from "@/utils/adminPeopleQueries";
import { queryKeys } from "@/utils/queryKeys";
import { createTestQueryClientHarness } from "./utils/queryClient";

const headers = () => ({ Authorization: "Bearer session" });
const page = (name: string, params: PeopleListParams) => ({
  items: [{ id: name, name, registration_count: 42 }],
  total: 200,
  page: params.page,
  limit: params.limit,
});

afterEach(() => vi.unstubAllGlobals());

describe("people server pages", () => {
  it("reads full-set counts and hides cached data when disabled", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ total: 200, active: 180, inactive: 20, by_role: { member: 150 } }),
      );
    vi.stubGlobal("fetch", fetch);
    const { Wrapper } = createTestQueryClientHarness();
    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        usePeopleCountsQuery({ q: "club", role: "member", active: false }, headers, enabled),
      { wrapper: Wrapper, initialProps: true },
    );
    await waitFor(() => expect(result.current.data?.total).toBe(200));
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/people/counts?q=club&role=member&active=false");
    rerender(false);
    expect(result.current.data).toBeUndefined();
  });

  it("loads paging, sort and combined filters, preserving the previous page", async () => {
    let finish: (value: Response) => void = () => {};
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page("first", { page: 1, limit: 5 })))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetch);
    const { Wrapper } = createTestQueryClientHarness();
    const { result, rerender } = renderHook(
      (params: PeopleListParams) => usePeopleListQuery(params, headers),
      { wrapper: Wrapper, initialProps: { page: 1, limit: 5 } as PeopleListParams },
    );
    await waitFor(() => expect(result.current.data?.total).toBe(200));
    expect(result.current.data?.items[0]?.registrationCount).toBe(42);
    const params: PeopleListParams = {
      page: 3,
      limit: 5,
      q: "phone",
      sort: "registration_count",
      sort_dir: "desc",
      role: "member",
      active: false,
    };
    rerender(params);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1]?.[0]).toBe(
      "/api/people?page=3&limit=5&q=phone&sort=registration_count&sort_dir=desc&role=member&active=false",
    );
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.items[0]?.name).toBe("first");
    await act(async () => finish(Response.json(page("third", params))));
    await waitFor(() => expect(result.current.data?.page).toBe(3));
  });

  it("aborts superseded requests and removes pages and in-flight writes on sign-out", async () => {
    const requests: { signal: AbortSignal; resolve: (value: Response) => void }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options) =>
          new Promise<Response>((resolve) => {
            requests.push({ signal: options.signal, resolve });
          }),
      ),
    );
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const { result, rerender } = renderHook(
      (q: string) => usePeopleListQuery({ page: 1, limit: 5, q }, headers),
      { wrapper: Wrapper, initialProps: "old" },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    rerender("new");
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]?.signal.aborted).toBe(true);
    await act(async () => requests[1]?.resolve(Response.json(page("new", { page: 1, limit: 5 }))));
    await waitFor(() => expect(result.current.data?.items[0]?.name).toBe("new"));
    rerender("pending");
    await waitFor(() => expect(requests).toHaveLength(3));
    act(() => queryClient.removeQueries({ queryKey: queryKeys.admin.people }));
    expect(requests[2]?.signal.aborted).toBe(true);
    await act(async () => {
      requests[0]?.resolve(Response.json(page("stale", { page: 1, limit: 5 })));
      requests[2]?.resolve(Response.json(page("signed-out", { page: 1, limit: 5 })));
    });
    expect(queryClient.getQueriesData({ queryKey: queryKeys.admin.people })).toEqual([]);
  });

  it("loads volunteer help periods from one bounded page and rejects unsupported predicates", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        ...page("volunteer", { page: 2, limit: 10 }),
        items: [{ id: "v", name: "V", help_periods: [{ id: 1, first_help_day: "2026-10-06" }] }],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const { Wrapper } = createTestQueryClientHarness();
    const { result } = renderHook(
      () => usePeopleListQuery({ page: 2, limit: 10, role: "volunteer", active: true }, headers),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.data?.items[0]?.helpPeriods).toHaveLength(1));
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/volunteers?page=2&limit=10&active=true");
    expect(() =>
      peopleListSearchParams({ page: 1, limit: 5, unsupported: true } as PeopleListParams),
    ).toThrow("Unsupported people list parameter");
  });
});
