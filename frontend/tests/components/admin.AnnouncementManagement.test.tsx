import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import AnnouncementManagement from "@/components/admin/AnnouncementManagement";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const announcement = {
  id: "ann-1",
  text_language: "en",
  text_nl: null,
  text_fr: null,
  text_en: "Doors open at six",
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
  server.use(http.get("/api/announcements", () => HttpResponse.json([announcement])));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AnnouncementManagement", () => {
  it("previews an untranslated announcement with its original text", async () => {
    render(<AnnouncementManagement authHeaders={authHeaders} />, {
      wrapper: createTestQueryClientWrapper(),
    });

    // The Dutch preview has no Dutch text: the original English text is shown instead.
    expect(await screen.findByText("Doors open at six")).toBeInTheDocument();
    expect(screen.queryByText(/no translation/i)).not.toBeInTheDocument();
  });

  it("sends the original language with the text", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/announcements", async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(announcement, { status: 201 });
      }),
    );
    render(<AnnouncementManagement authHeaders={authHeaders} />, {
      wrapper: createTestQueryClientWrapper(),
    });
    await screen.findByText("Doors open at six");

    fireEvent.change(screen.getByLabelText(/Text.*NL/i), { target: { value: "Deuren open" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toMatchObject({ text_language: "nl", text_nl: "Deuren open" });
  });
});
