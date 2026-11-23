import { jsonResponse } from "@/mocks/response";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "msw/http";
import AnnouncementManagement from "@/features/admin/shared/AnnouncementManagement";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../../../utils/queryClient";

const announcement: import("@/api-types").AnnouncementOut = {
  published_at: null,
  published_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  id: "ann-1",
  text_nl: "Deuren open om zes",
  text_fr: null,
  text_en: null,
  level: "info",
  active: true,
  sort_order: 0,
  starts_at: null,
  ends_at: null,
  link_url: null,
  link_label_nl: null,
  link_label_fr: null,
  link_label_en: null,
};

beforeEach(() => {
  setLocale("en", { reload: false });
  server.use(
    http.get("/api/announcements", () =>
      jsonResponse<import("@/api-types").AnnouncementOut[]>([announcement]),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AnnouncementManagement", () => {
  it("shows the Dutch text of an announcement without translations", async () => {
    render(<AnnouncementManagement />, {
      wrapper: createTestQueryClientWrapper(),
    });

    expect(await screen.findByText("Deuren open om zes")).toBeInTheDocument();
    expect(screen.queryByText(/no translation/i)).not.toBeInTheDocument();
  });

  it("sends the Dutch text without an original-language flag", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/announcements", async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return jsonResponse<import("@/api-types").AnnouncementOut>(announcement, {
          status: 201,
        });
      }),
    );
    render(<AnnouncementManagement />, {
      wrapper: createTestQueryClientWrapper(),
    });
    await screen.findByText("Deuren open om zes");

    fireEvent.click(screen.getByRole("button", { name: "Add announcement" }));
    fireEvent.change(screen.getByLabelText(/Text.*NL/i), { target: { value: "Deuren open" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toMatchObject({ text_nl: "Deuren open" });
    expect(sent).not.toHaveProperty("text_language");
  });
});
