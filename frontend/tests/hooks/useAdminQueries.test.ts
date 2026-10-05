import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer ".concat("mock-access-token"),
});

const emptyPage = { items: [], total: 0, limit: 1000, page: 1 };

function renderQueries(options: { visible?: boolean; isAuthenticated?: boolean } = {}) {
  const { Wrapper } = createTestQueryClientHarness();
  return renderHook(
    () =>
      useAdminQueries({
        visible: options.visible ?? true,
        isAuthenticated: options.isAuthenticated ?? true,
        canManageAdminSections: true,
        authHeaders,
      }),
    { wrapper: Wrapper },
  );
}

describe("useAdminQueries loadData", () => {
  it("refetches the registrations and exhibitors collections", async () => {
    const { result } = renderQueries();
    await waitFor(() => {
      expect(result.current.registrationsQuery.data?.length).toBeGreaterThan(0);
      expect(result.current.exhibitorsQuery.data?.length).toBeGreaterThan(0);
    });
    server.use(
      http.get("/api/registrations", () => HttpResponse.json(emptyPage)),
      http.get("/api/exhibitors", () => HttpResponse.json([])),
    );

    await act(() => result.current.loadData());

    await waitFor(() => {
      expect(result.current.registrationsQuery.data).toHaveLength(0);
      expect(result.current.exhibitorsQuery.data).toHaveLength(0);
    });
  });

  it("does not start a registrations request while the dashboard is hidden", async () => {
    let requests = 0;
    server.use(
      http.get("/api/registrations", () => {
        requests += 1;
        return HttpResponse.json(emptyPage);
      }),
    );
    const { result } = renderQueries({ visible: false });

    await act(() => result.current.loadData());

    expect(requests).toBe(0);
  });
});
