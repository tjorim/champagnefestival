import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import FaqManagement from "@/components/admin/FaqManagement";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const item = {
  id: "faq-1",
  text_language: "en",
  question_nl: "Wanneer?",
  question_fr: null,
  question_en: "When?",
  answer_nl: "Op 2 oktober.",
  answer_fr: null,
  answer_en: "On 2 October.",
  sort_order: 0,
  active: true,
};

function mount() {
  render(<FaqManagement authHeaders={authHeaders} />, { wrapper: createTestQueryClientWrapper() });
}

beforeEach(() => {
  setLocale("en", { reload: false });
  server.use(http.get("/api/faq", () => HttpResponse.json([item])));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FaqManagement", () => {
  it("lists an item in its original language and marks which languages are translated", async () => {
    mount();

    expect(await screen.findByText("When?")).toBeInTheDocument();
    expect(screen.getByText("On 2 October.")).toBeInTheDocument();
    expect(screen.getByText("NL")).not.toHaveClass("opacity-50");
    expect(screen.getByText("FR")).toHaveClass("opacity-50");
  });

  it("requires the question and answer in the original language", async () => {
    const post = vi.fn();
    server.use(
      http.post("/api/faq", () => {
        post();
        return HttpResponse.json(item, { status: 201 });
      }),
    );
    mount();
    await screen.findByText("When?");

    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    // The original language defaults to Dutch; only English is filled in.
    fireEvent.change(await screen.findByLabelText("Question (English)"), {
      target: { value: "Where?" },
    });
    fireEvent.change(screen.getByLabelText("Answer (English)"), { target: { value: "Ostend." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Question is required.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("saves every language with blank translations as null", async () => {
    let sent: unknown;
    server.use(
      http.put("/api/faq/:id", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(item);
      }),
    );
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("Question (French)"), {
      target: { value: "Quand ?" },
    });
    fireEvent.change(screen.getByLabelText("Answer (French)"), {
      target: { value: "Le 2 octobre." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toEqual({
      text_language: "en",
      question_nl: "Wanneer?",
      question_fr: "Quand ?",
      question_en: "When?",
      answer_nl: "Op 2 oktober.",
      answer_fr: "Le 2 octobre.",
      answer_en: "On 2 October.",
    });
  });
});
