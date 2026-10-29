import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw/http";
import EventModal from "@/components/admin/EventModal";
import type { Edition } from "@/components/admin/editionTypes";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import type { Event } from "@/types/event";
import { noEventTranslations } from "../utils/eventFixtures";

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const edition = {
  id: "march-2027",
  year: 2027,
  month: "march",
  editionType: "festival",
  active: true,
  dates: ["2027-03-06", "2027-03-07"],
} as unknown as Edition;

const existingEvent: Event = {
  ...noEventTranslations,
  id: "event-01",
  editionId: "march-2027",
  title: "Openingsavond",
  titleNl: "Openingsavond",
  description: "Een glas om te starten",
  descriptionNl: "Een glas om te starten",
  date: "2027-03-06",
  startTime: "18:00",
  category: "ceremony",
  registrationRequired: false,
  active: true,
  createdAt: "",
  updatedAt: "",
  products: [],
};

function mount(initial: Event | null, onSave = vi.fn(), selectedEdition = edition) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EventModal
        show
        edition={selectedEdition}
        initial={initial}
        authHeaders={authHeaders}
        onSave={onSave}
        onHide={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

function fillRequiredScheduleFields() {
  fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "18:00" } });
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => {
  setLocale("en", { reload: false });
  server.use(http.get("/api/events/translation", () => HttpResponse.json({ languages: [] })));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EventModal translations", () => {
  it("explains the editable date for the first standalone event", () => {
    mount(null, vi.fn(), { ...edition, dates: [], editionType: "capsule_exchange" });
    expect(screen.getByLabelText("Date")).not.toHaveAttribute("readonly");
    expect(screen.getByText("Choose the date for this edition’s first event.")).toBeInTheDocument();
    expect(screen.queryByText("This event uses the edition date.")).not.toBeInTheDocument();
  });

  it("fills each language from the event", () => {
    mount(existingEvent);

    expect(screen.getByLabelText("Title (Dutch)")).toHaveValue("Openingsavond");
    expect(screen.getByLabelText("Title (French)")).toHaveValue("");
    expect(screen.getByLabelText("Title (English)")).toHaveValue("");
    expect(screen.getByLabelText("Description (Dutch)")).toHaveValue("Een glas om te starten");
  });

  it("requires a Dutch title before saving", async () => {
    const onSave = mount(null);

    fillRequiredScheduleFields();
    await screen.findByText("Tasting"); // the first category is preselected once they load
    fireEvent.click(screen.getByRole("tab", { name: "English" }));
    fireEvent.change(screen.getByLabelText("Title (English)"), { target: { value: "Opening" } });
    save();

    // Dutch is still empty.
    expect(await screen.findByText("Enter a title in Dutch.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dutch" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Title (Dutch)")).toHaveFocus();
    fireEvent.click(screen.getByRole("tab", { name: "English" }));
    save();
    await waitFor(() => expect(screen.getByLabelText("Title (Dutch)")).toHaveFocus());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires Dutch description text when a translated description exists", async () => {
    const onSave = mount(null);

    fillRequiredScheduleFields();
    await screen.findByText("Tasting");
    fireEvent.change(screen.getByLabelText("Title (Dutch)"), { target: { value: "Opening" } });
    fireEvent.change(screen.getByLabelText("Description (English)"), {
      target: { value: "An evening" },
    });
    save();

    expect(
      await screen.findByText("Enter a description in Dutch, or clear all description texts."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves every language", async () => {
    const onSave = mount(existingEvent);

    fireEvent.change(screen.getByLabelText("Title (French)"), {
      target: { value: "Soirée d'ouverture" },
    });
    fireEvent.change(screen.getByLabelText("Title (English)"), {
      target: { value: "Opening night" },
    });
    save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      titleNl: "Openingsavond",
      titleFr: "Soirée d'ouverture",
      titleEn: "Opening night",
      descriptionNl: "Een glas om te starten",
      category: "ceremony",
    });
  });

  it("starts a new event in the first category and saves its key", async () => {
    const onSave = mount(null);

    fillRequiredScheduleFields();
    await screen.findByText("Tasting");
    fireEvent.change(screen.getByLabelText("Title (Dutch)"), { target: { value: "Opening" } });
    save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ category: "tasting" });
  });

  it("keeps an existing event's category and does not save without one", async () => {
    server.use(http.get("/api/event-categories", () => HttpResponse.json([])));
    const onSave = mount({ ...existingEvent, category: "" });

    save();

    expect(await screen.findByText("Choose a category")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("offers a draft translation that fills only the empty target and stays editable", async () => {
    server.use(
      http.get("/api/events/translation", () => HttpResponse.json({ languages: ["nl", "en"] })),
      http.post("/api/events/translation", async ({ request }) => {
        const body = (await request.json()) as { text: string; source: string; target: string };
        expect(body).toEqual({ text: "Openingsavond", source: "nl", target: "en" });
        return HttpResponse.json({ text: "Opening evening" });
      }),
    );
    mount(existingEvent);

    fireEvent.click(screen.getByRole("tab", { name: "English" }));

    // Only the pairs the service supports offer a draft: nl -> en, not French.
    const buttons = await screen.findAllByRole("button", { name: "Suggest translation" });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);

    await waitFor(() =>
      expect(screen.getByLabelText("Title (English)")).toHaveValue("Opening evening"),
    );
    expect(screen.getByLabelText("Title (French)")).toHaveValue("");
  });

  it("does not submit the event form when Enter is pressed in an order question field", async () => {
    server.use(http.get("/api/events/event-01", () => HttpResponse.json({ order_questions: [] })));
    const onSave = mount(existingEvent);

    fireEvent.click(screen.getByRole("button", { name: "Order questions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add question" }));
    const title = screen.getAllByLabelText("Title (Dutch)").at(-1)!;
    fireEvent.change(title, { target: { value: "Opmerking" } });
    // fireEvent.keyDown does not trigger implicit submission; userEvent does.
    await userEvent.type(title, "{Enter}");

    expect(onSave).not.toHaveBeenCalled();
    expect(title).toHaveValue("Opmerking");
  });
});
