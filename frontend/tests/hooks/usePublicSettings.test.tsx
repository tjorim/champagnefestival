import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  FALLBACK_APP_SETTINGS,
  fetchAppSettings,
  usePublicSettings,
} from "@/hooks/useMaintenanceMode";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

describe("public settings", () => {
  it("fills fields missing from an older API response with compiled defaults", async () => {
    server.use(http.get("/api/settings", () => HttpResponse.json({ maintenance_mode: true })));
    await expect(fetchAppSettings()).resolves.toEqual({
      ...FALLBACK_APP_SETTINGS,
      maintenance_mode: true,
    });
  });

  it("retains the last good public values through a server failure", async () => {
    let fails = false;
    server.use(
      http.get("/api/settings", () =>
        fails
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({
              maintenance_mode: false,
              public_email: "live@example.com",
              public_phone: "+32 59 10 20 30",
              facebook_url: "https://www.facebook.com/live",
            }),
      ),
    );
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const { result } = renderHook(() => usePublicSettings(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.public_email).toBe("live@example.com"));

    fails = true;
    await queryClient.refetchQueries({ queryKey: ["maintenance-mode"] });
    expect(result.current.public_email).toBe("live@example.com");
  });
});
