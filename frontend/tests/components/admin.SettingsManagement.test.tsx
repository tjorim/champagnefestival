import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import SettingsManagement from "@/components/admin/SettingsManagement";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const initialSettings = {
  maintenance_mode: false,
  public_email: "old@example.com",
  public_phone: "+32 59 11 22 33",
  facebook_url: "https://www.facebook.com/old",
};

describe("SettingsManagement", () => {
  it("loads and saves all public contact settings without retrying", async () => {
    let submitted: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/settings", () => HttpResponse.json(initialSettings)),
      http.put("/api/settings", async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...initialSettings, ...submitted });
      }),
    );

    render(<SettingsManagement authHeaders={() => ({ Authorization: "Bearer test" })} />, {
      wrapper: createTestQueryClientWrapper(),
    });

    const email = await screen.findByLabelText("Public email address");
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Public telephone number"), {
      target: { value: "+32 59 44 55 66" },
    });
    fireEvent.change(screen.getByLabelText("Facebook URL"), {
      target: { value: "https://www.facebook.com/new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save contact details" }));

    await waitFor(() =>
      expect(submitted).toEqual({
        public_email: "new@example.com",
        public_phone: "+32 59 44 55 66",
        facebook_url: "https://www.facebook.com/new",
      }),
    );
  });
});
