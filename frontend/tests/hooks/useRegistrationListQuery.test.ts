import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "@/mocks/server";
import { useRegistrationCountsQuery } from "@/hooks/useRegistrationListQuery";
import { createTestQueryClientHarness } from "../utils/queryClient";

it("counts historical facets on the server with bounded reads", async () => {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/api/registrations", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      expect(params.get("limit")).toBe("1");
      const total = params.has("edition_id") ? 12 : params.has("status") ? 25 : 100;
      return HttpResponse.json({ items: [], total, limit: 1, page: 1 });
    }),
  );
  const { Wrapper } = createTestQueryClientHarness();
  const view = renderHook(() => useRegistrationCountsQuery("active", "2026-10-07", () => ({})), {
    wrapper: Wrapper,
  });
  await waitFor(() =>
    expect(view.result.current.data).toEqual({
      all: 100,
      pending: 25,
      confirmed: 25,
      festival: 100,
      standalone: 100,
      active: 12,
      today: 100,
    }),
  );
  expect(requests).toHaveLength(7);
  expect(requests.filter((params) => params.has("edition_id"))).toHaveLength(1);
});
