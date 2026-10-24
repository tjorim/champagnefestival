import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { HttpResponse, http } from "msw/http";
import { beforeEach, describe, expect, it } from "vitest";
import ComposerManagement from "@/components/admin/ComposerManagement";
import { server } from "@/mocks/server";
import { readAdminOptions, selectAdminOption } from "../helpers/adminSelect";
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
  email_category_key: null,
  state: "draft",
  scheduled_at: null,
  announcement_id: null,
  push_audience_snapshot: null,
  email_audience_snapshot: null,
  sent_at: null,
  created_at: "2026-09-07T10:00:00Z",
  estimated_push_audience: 42,
  push_delivered_count: 0,
  push_failed_count: 0,
  push_pending_count: 0,
  estimated_email_audience: 0,
  email_accepted_count: 0,
  email_failed_count: 0,
  email_skipped_count: 0,
  email_pending_count: 0,
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
  beforeEach(() => {
    server.use(http.get("/api/email-categories", () => HttpResponse.json([])));
  });

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
    fireEvent.click(screen.getByRole("button", { name: "New message draft" }));

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

  it("composes an email draft for a consent category, hiding automatic ones", async () => {
    let submitted: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/composer", () => HttpResponse.json([])),
      http.get("/api/email-categories", () =>
        HttpResponse.json([
          { key: "club_news", name: "Club news", automatic: false },
          { key: "reward_ready", name: "Reward ready", automatic: true },
        ]),
      ),
      http.post("/api/composer", async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...draftMessage, ...submitted }, { status: 201 });
      }),
    );

    renderComposer();
    await screen.findByText("No composed messages yet.");
    fireEvent.click(screen.getByRole("button", { name: "New message draft" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Ruilbeurs" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Zaterdag" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Email to members" }));

    const create = screen.getByRole("button", { name: "Create draft" });
    expect(create).toBeDisabled();
    const select = await screen.findByRole("combobox", { name: "Email audience (category)" });
    await waitFor(async () =>
      expect((await readAdminOptions(select)).map((option) => option.value)).toEqual([
        "",
        "club_news",
      ]),
    );
    await selectAdminOption(select, "club_news");
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    await waitFor(() =>
      expect(submitted).toEqual(
        expect.objectContaining({
          channels: ["announcement", "email"],
          email_category_key: "club_news",
        }),
      ),
    );
  });

  it("confirms the email recipient count and sends it with the schedule request", async () => {
    const emailDraft = {
      ...draftMessage,
      channels: ["email"],
      email_category_key: "club_news",
      estimated_email_audience: 7,
    };
    let scheduleBody: unknown;
    server.use(
      http.get("/api/composer", () => HttpResponse.json([emailDraft])),
      http.post("/api/composer/cmp_1/schedule", async ({ request }) => {
        scheduleBody = await request.json();
        return HttpResponse.json({ ...emailDraft, state: "scheduled" });
      }),
    );

    renderComposer();
    expect(await screen.findByText(/Estimated email recipients: 7/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Email recipients: 7/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(scheduleBody).toEqual({ expected_email_audience: 7 }));
  });

  it("explains that member mail is not set up instead of showing the English detail", async () => {
    server.use(
      http.get("/api/composer", () =>
        HttpResponse.json([
          { ...draftMessage, channels: ["email"], email_category_key: "club_news" },
        ]),
      ),
      http.post("/api/composer/cmp_1/schedule", () =>
        HttpResponse.json(
          { detail: "Member mail is not configured.", code: "member_mail_unavailable" },
          { status: 409 },
        ),
      ),
    );
    renderComposer();
    await screen.findByText("Festivalupdate");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Member mail is not set up yet, so email cannot be sent.",
    );
  });

  it("shows the email results of a sent message", async () => {
    server.use(
      http.get("/api/composer", () =>
        HttpResponse.json([
          {
            ...sentMessage,
            channels: ["email"],
            email_accepted_count: 5,
            email_skipped_count: 2,
            email_failed_count: 1,
            email_pending_count: 0,
          },
        ]),
      ),
    );
    renderComposer();
    expect(
      await screen.findByText("Email: 5 accepted, 2 skipped, 1 failed, 0 pending"),
    ).toBeInTheDocument();
  });

  it("blocks duplicate submissions while a draft save is pending", async () => {
    let requests = 0;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.use(
      http.get("/api/composer", () => HttpResponse.json([])),
      http.post("/api/composer", async () => {
        requests += 1;
        await pending;
        return HttpResponse.json(draftMessage, { status: 201 });
      }),
    );
    renderComposer();
    await screen.findByText("No composed messages yet.");
    fireEvent.click(screen.getByRole("button", { name: "New message draft" }));
    const button = screen.getByRole("button", { name: "Create draft" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.submit(document.getElementById("composer-form")!);
    await waitFor(() => expect(requests).toBe(1));
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toBe(1);
  });

  it("displays scheduling failures without automatically retrying", async () => {
    let requests = 0;
    server.use(
      http.get("/api/composer", () => HttpResponse.json([draftMessage])),
      http.post("/api/composer/cmp_1/schedule", () => {
        requests += 1;
        return HttpResponse.json({ detail: "Scheduling failed" }, { status: 500 });
      }),
    );
    renderComposer();
    await screen.findByText("Festivalupdate");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The message could not be sent.");
    expect(requests).toBe(1);
  });

  it("has no axe violations", async () => {
    server.use(http.get("/api/composer", () => HttpResponse.json([draftMessage])));
    const { container } = renderComposer();
    await screen.findByText("Festivalupdate");
    expect(await axe(container)).toHaveNoViolations();
  });
});
