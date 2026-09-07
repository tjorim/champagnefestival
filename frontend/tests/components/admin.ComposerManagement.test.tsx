import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import ComposerManagement from "@/components/admin/ComposerManagement";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const draftMessage = {
  id: "cmp_1",
  title_nl: "Festivalupdate",
  title_en: "Festival update",
  title_fr: "Mise à jour du festival",
  body_nl: "Inhoud",
  body_en: "Body",
  body_fr: "Contenu",
  level: "info",
  channels: ["announcement", "push"],
  link_url: null,
  state: "draft",
  scheduled_at: null,
  announcement_id: null,
  push_audience_snapshot: null,
  sent_at: null,
  created_at: "2026-09-07T10:00:00Z",
  estimated_push_audience: 42,
  push_delivered_count: 0,
  push_failed_count: 0,
  push_pending_count: 0,
};

const sentMessage = {
  ...draftMessage,
  id: "cmp_2",
  title_nl: "Reeds verstuurd",
  title_en: "Already sent",
  title_fr: "Déjà envoyé",
  state: "sent",
  push_delivered_count: 40,
  push_failed_count: 1,
  push_pending_count: 1,
};

function renderComposer() {
  return render(<ComposerManagement authHeaders={() => ({ Authorization: "Bearer test" })} />, {
    wrapper: createTestQueryClientWrapper(),
  });
}

describe("ComposerManagement", () => {
  it("lists composed messages with their state and results", async () => {
    server.use(http.get("/api/composer", () => HttpResponse.json([draftMessage, sentMessage])));

    renderComposer();

    expect(await screen.findByText("Festivalupdate")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("sent")).toBeInTheDocument();
    expect(screen.getByText(/40 delivered, 1 failed, 1 pending/)).toBeInTheDocument();
  });

  it("creates a new draft", async () => {
    let submitted: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/composer", () => HttpResponse.json([])),
      http.post("/api/composer", async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...draftMessage, ...submitted }, { status: 201 });
      }),
    );

    renderComposer();
    await screen.findByText("No composed messages yet.");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Nieuwe titel" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Nieuwe inhoud" } });
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() =>
      expect(submitted).toEqual(
        expect.objectContaining({
          title_nl: "Nieuwe titel",
          body_nl: "Nieuwe inhoud",
          channels: ["announcement"],
        }),
      ),
    );
  });

  it("requires confirmation before sending, and shows the estimated audience", async () => {
    let scheduled = false;
    server.use(
      http.get("/api/composer", () => HttpResponse.json([draftMessage])),
      http.post("/api/composer/cmp_1/schedule", () => {
        scheduled = true;
        return HttpResponse.json({ ...draftMessage, state: "scheduled" });
      }),
    );

    renderComposer();
    await screen.findByText("Festivalupdate");
    expect(screen.getByText(/Estimated audience: 42/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Estimated Web Push audience: 42/)).toBeInTheDocument();
    expect(scheduled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(scheduled).toBe(true));
  });

  it("has no axe violations", async () => {
    server.use(http.get("/api/composer", () => HttpResponse.json([draftMessage])));
    const { container } = renderComposer();
    await screen.findByText("Festivalupdate");
    expect(await axe(container)).toHaveNoViolations();
  });
});
