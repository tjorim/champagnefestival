import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import EventCategoryManagement from "@/components/admin/EventCategoryManagement";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

function category(key: string, nl: string, order: number) {
  return {
    key,
    label: nl,
    label_language: "nl",
    label_nl: nl,
    label_fr: null,
    label_en: null,
    sort_order: order,
  };
}

function mount() {
  render(<EventCategoryManagement authHeaders={authHeaders} />, {
    wrapper: createTestQueryClientWrapper(),
  });
}

beforeEach(() => {
  setLocale("en", { reload: false });
  server.use(
    http.get("/api/event-categories", () =>
      HttpResponse.json([category("tasting", "Degustatie", 10), category("gala", "Gala", 20)]),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EventCategoryManagement", () => {
  it("lists the categories with their keys and labels", async () => {
    mount();

    const row = (await screen.findByText("gala")).closest("tr")!;
    expect(within(row).getByText("Gala")).toBeInTheDocument();
    expect(screen.getByText("tasting")).toBeInTheDocument();
  });

  it("creates a category with a key and a label in its original language", async () => {
    let sent: unknown;
    server.use(
      http.post("/api/event-categories", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(category("workshop", "Workshop", 30), { status: 201 });
      }),
    );
    mount();
    await screen.findByText("gala");

    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    fireEvent.change(await screen.findByLabelText("Key"), { target: { value: "workshop" } });
    fireEvent.change(screen.getByLabelText("Label (Dutch)"), { target: { value: "Workshop" } });
    fireEvent.change(screen.getByLabelText("Label (English)"), { target: { value: "Workshop!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toEqual({
      key: "workshop",
      label_language: "nl",
      label_nl: "Workshop",
      label_fr: null,
      label_en: "Workshop!",
      sort_order: 30,
    });
  });

  it("rejects an invalid key and a missing original label before calling the API", async () => {
    const post = vi.fn();
    server.use(
      http.post("/api/event-categories", () => {
        post();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    mount();
    await screen.findByText("gala");

    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    fireEvent.change(await screen.findByLabelText("Key"), { target: { value: "Bad Key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/must start with a lowercase letter/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "good-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a label in its original language.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("edits labels but never the key", async () => {
    let sent: { url: string; body: unknown } | undefined;
    server.use(
      http.put("/api/event-categories/:key", async ({ request, params }) => {
        sent = { url: String(params.key), body: await request.json() };
        return HttpResponse.json(category("gala", "Gala", 20));
      }),
    );
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Edit gala" }));
    const key = await screen.findByLabelText("Key");
    expect(key).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Label (French)"), { target: { value: "Gala FR" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent?.url).toBe("gala");
    expect(sent?.body).toMatchObject({ label_nl: "Gala", label_fr: "Gala FR", label_en: null });
    expect(sent?.body).not.toHaveProperty("key");
  });

  it("shows the server's refusal to delete a category that events use", async () => {
    server.use(
      http.delete("/api/event-categories/:key", () =>
        HttpResponse.json(
          { detail: "Cannot delete event category 'gala': 2 event(s) still use it." },
          { status: 409 },
        ),
      ),
    );
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Delete gala" }));
    fireEvent.click(await screen.findByRole("button", { name: /^(Delete|Confirm|Yes)/ }));

    expect(await screen.findByText(/2 event\(s\) still use it/)).toBeInTheDocument();
  });
});
