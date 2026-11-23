import type { RegistrationDashboardStats } from "@/api-types";
import { jsonResponse } from "@/mocks/response";
import { renderHook, waitFor } from "@testing-library/react";
import { http } from "msw/http";
import { expect, it } from "vitest";
import { server } from "@/mocks/server";
import { useRegistrationCountsQuery } from "@/features/admin/registrations/useRegistrationListQuery";
import { createTestQueryClientHarness } from "../../../utils/queryClient";

it("requests all historical facets and attendance in one stats read", async () => {
  const requests: string[] = [];
  const stats: RegistrationDashboardStats = {
    all: 100,
    pending: 25,
    confirmed: 70,
    festival: 75,
    standalone: 25,
    active: 12,
    today: 4,
    events: [
      {
        event_id: "event-1",
        event_title: "Bourse",
        edition_id: "active",
        total: 20,
        checked_in: 6,
      },
    ],
  };

  server.use(
    http.get("/api/registrations", ({ request }) => {
      requests.push(new URL(request.url).pathname);
      return jsonResponse<import("@/api-types").RegistrationListEnvelope>({
        items: [],
        total: 0,
        limit: 1,
        page: 1,
      });
    }),
    http.get("/api/registrations/stats", ({ request }) => {
      const url = new URL(request.url);
      requests.push(url.pathname + url.search);
      return jsonResponse<RegistrationDashboardStats>(stats);
    }),
  );

  const { Wrapper } = createTestQueryClientHarness();
  const view = renderHook(() => useRegistrationCountsQuery("active", "2026-10-07", () => ({})), {
    wrapper: Wrapper,
  });

  await waitFor(() => expect(view.result.current.data).toEqual(stats));
  expect(requests).toEqual(["/api/registrations/stats?event_date=2026-10-07&edition_id=active"]);
});
