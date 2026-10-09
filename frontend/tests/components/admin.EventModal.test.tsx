import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
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
  descriptionLanguage: "nl",
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

function mount(initial: Event | null, onSave = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EventModal
        show
        edition={edition}
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
  it("fills each language from the event and keeps the original language", () => {
    mount(existingEvent);

    expect(screen.getByLabelText("Title (Dutch)")).toHaveValue("Openingsavond");
    expect(screen.getByLabelText("Title (French)")).toHaveValue("");
    expect(screen.getByLabelText("Title (English)")).toHaveValue("");
    expect(screen.getByLabelText("Description (Dutch)")).toHaveValue("Een glas om te starten");
  });

  it("requires a title in the original language before saving", async () => {
    const onSave = mount(null);

    fillRequiredScheduleFields();
    fireEvent.change(screen.getByLabelText("Title (English)"), { target: { value: "Opening" } });
    save();

    // The original language defaults to Dutch, which is still empty.
    expect(await screen.findByText("Enter a title in its original language.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires description text in its original language when any description exists", async () => {
    const onSave = mount(null);

    fillRequiredScheduleFields();
    fireEvent.change(screen.getByLabelText("Title (Dutch)"), { target: { value: "Opening" } });
    fireEvent.change(screen.getByLabelText("Description (English)"), {
      target: { value: "An evening" },
    });
    save();

    expect(
      await screen.findByText(
        "Enter a description in its original language, or clear all description texts.",
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves every language and the chosen original languages", async () => {
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
      titleLanguage: "nl",
      titleNl: "Openingsavond",
      titleFr: "Soirée d'ouverture",
      titleEn: "Opening night",
      descriptionLanguage: "nl",
      descriptionNl: "Een glas om te starten",
      category: "ceremony",
    });
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

    // Only the pairs the service supports offer a draft: nl -> en, not French.
    const buttons = await screen.findAllByRole("button", { name: "Suggest translation" });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);

    await waitFor(() =>
      expect(screen.getByLabelText("Title (English)")).toHaveValue("Opening evening"),
    );
    expect(screen.getByLabelText("Title (French)")).toHaveValue("");
  });
});
