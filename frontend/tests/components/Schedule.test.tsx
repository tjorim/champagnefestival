import { jsonResponse } from "@/mocks/response";
import { render, screen, fireEvent } from "@testing-library/react";
import { http } from "msw/http";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import Schedule from "@/components/Schedule";
import { getLocale } from "@/paraglide/runtime";
import { NO_PRODUCT_TRANSLATIONS } from "@/types/event";
import { noEventTranslations } from "../utils/eventFixtures";

vi.mock("@/paraglide/messages", () => ({
  m: {
    schedule_days_friday: () => "Friday",
    schedule_days_saturday: () => "Saturday",
    schedule_days_sunday: () => "Sunday",
    schedule_start_time: () => "Start time",
    schedule_end_time: () => "End time",
    schedule_time_range: ({ start, end }: { start: string; end: string }) => `${start} - ${end}`,
    schedule_time: () => "Time",
    schedule_registration: () => "Registration required",
    schedule_order_available: () => "VIP package available",
    schedule_no_events: () => "No events",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: vi.fn().mockReturnValue("nl"),
  setLocale: vi.fn(),
  isLocale: vi.fn().mockReturnValue(true),
}));

const mockEvents = [
  {
    id: "fri-tasting",
    edition_id: "ed-1",
    ...noEventTranslations,
    ...{ end_time: null },
    volunteers_only: false,
    members_only: false,
    registrations_open_from: null,
    registrations_close_at: null,
    order_questions: [],
    title: "Winery Tour",
    start_time: "17:00",
    end_time: "23:00",
    description: "Tasting event",
    category: "tasting" as const,
    date: "2025-10-03",
    products: [],
    registration_required: false,
    active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "fri-vip",
    edition_id: "ed-1",
    ...noEventTranslations,
    ...{ end_time: null },
    volunteers_only: false,
    members_only: false,
    registrations_open_from: null,
    registrations_close_at: null,
    order_questions: [],
    title: "VIP",
    start_time: "19:30",
    description: "VIP event",
    category: "vip" as const,
    date: "2025-10-03",
    products: [],
    registration_required: true,
    active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "sat-party",
    edition_id: "ed-1",
    ...noEventTranslations,
    ...{ end_time: null },
    volunteers_only: false,
    members_only: false,
    registrations_open_from: null,
    registrations_close_at: null,
    order_questions: [],
    end_time: null,
    title: "Party",
    start_time: "20:00",
    description: "Party event",
    category: "party" as const,
    date: "2025-10-04",
    products: [],
    registration_required: false,
    active: true,
    created_at: "",
    updated_at: "",
  },
];

function label(key: string, nl: string, fr: string, en: string) {
  return {
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    key,
    label: nl,
    label_nl: nl,
    label_fr: fr,
    label_en: en,
    sort_order: 0,
  };
}

beforeEach(() => {
  server.use(
    http.get("/api/event-categories", () =>
      jsonResponse<import("@/api-types").CategoryOut[]>([
        label("tasting", "Tasting", "Dégustation", "Tasting"),
        label("vip", "VIP", "VIP", "VIP"),
        label("party", "Party", "Soirée", "Party"),
        label("ceremony", "Ceremony", "Cérémonie", "Ceremony"),
      ]),
    ),
  );
});

/** The category labels come from the API, so the schedule renders inside a query client. */
function renderSchedule(ui: React.ReactElement) {
  return render(ui, { wrapper: createTestQueryClientWrapper() });
}

afterEach(() => {
  vi.mocked(getLocale).mockReturnValue("nl");
});

describe("Schedule component", () => {
  it("links panels to tabs and switches with the keyboard without axe violations", async () => {
    const user = userEvent.setup();
    const { container } = renderSchedule(<Schedule events={mockEvents} />);
    const friday = screen.getByRole("tab", { name: /Friday/ });
    friday.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Saturday/ })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Party" })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("shows the empty programme message when no dates are available", () => {
    renderSchedule(<Schedule events={[]} />);
    expect(screen.getByText("No events")).toBeInTheDocument();
  });

  it("renders day tabs", () => {
    renderSchedule(<Schedule events={mockEvents} />);
    expect(screen.getByText("Friday")).toBeInTheDocument();
    expect(screen.getByText("Saturday")).toBeInTheDocument();
  });

  it("renders events for the default active day (Friday)", () => {
    renderSchedule(<Schedule events={mockEvents} />);
    expect(screen.getByRole("heading", { name: "Winery Tour" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "VIP" })).toBeInTheDocument();
  });

  it("shows registration badge for events that require registration", () => {
    renderSchedule(<Schedule events={mockEvents} />);
    expect(screen.getByText("Registration required")).toBeInTheDocument();
  });

  it("shows an order badge instead, for a walk-in event with products", () => {
    const eventsWithProduct = [
      {
        ...mockEvents[0]!,
        products: [
          {
            id: "product-1",
            event_id: "fri-tasting",
            ...NO_PRODUCT_TRANSLATIONS,
            unit: "item" as const,
            available_quantity: null,
            sold_out: false,
            inclusions: null,
            included_product_id: null,
            included_per_guests: null,
            name: "VIP Package",
            description: "",
            price: "50",
            category: "other" as const,
            purchasable: true,
            required: false,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ];
    renderSchedule(<Schedule events={eventsWithProduct} />);
    expect(screen.getByText("VIP package available")).toBeInTheDocument();
    expect(screen.queryByText("Registration required")).not.toBeInTheDocument();
  });

  it("shows no registration-related badge for a plain walk-in event", () => {
    renderSchedule(<Schedule events={[mockEvents[0]!]} />);
    expect(screen.queryByText("Registration required")).not.toBeInTheDocument();
    expect(screen.queryByText("VIP package available")).not.toBeInTheDocument();
  });

  it("shows category badge", async () => {
    renderSchedule(<Schedule events={mockEvents} />);
    expect(
      await screen.findByText("Tasting", { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument();
  });

  it("switches to Saturday tab and shows Saturday events", () => {
    renderSchedule(<Schedule events={mockEvents} />);
    fireEvent.click(screen.getByText("Saturday"));
    expect(screen.getByRole("heading", { name: "Party" })).toBeInTheDocument();
  });

  it("displays start and end times for events", () => {
    renderSchedule(<Schedule events={mockEvents} />);
    expect(screen.getByText("17:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
  });

  it("omits the category badge for a category the API does not know", async () => {
    renderSchedule(<Schedule events={[{ ...mockEvents[0]!, category: "vanished" }]} />);
    expect(await screen.findByRole("heading", { name: "Winery Tour" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("vanished")).not.toBeInTheDocument();
  });

  describe("translated events", () => {
    const translated = {
      ...mockEvents[0]!,
      id: "fri-opening",
      title: "Openingsavond",
      title_nl: "Openingsavond",
      title_fr: "Soirée d'ouverture",
      title_en: "Opening night",
      description: "Een glas om te starten",
      description_nl: "Een glas om te starten",
      description_fr: "Un verre pour commencer",
      category: "ceremony" as const,
    };

    it.each([
      ["nl", "Openingsavond", "Een glas om te starten", "Ceremony"],
      ["fr", "Soirée d'ouverture", "Un verre pour commencer", "Cérémonie"],
      // No English description: Dutch shows instead of an empty paragraph.
      ["en", "Opening night", "Een glas om te starten", "Ceremony"],
    ])(
      "shows the %s text and a translated category",
      async (locale, title, description, expectedCategory) => {
        vi.mocked(getLocale).mockReturnValue(locale as "nl" | "fr" | "en");
        renderSchedule(<Schedule events={[translated]} />);
        expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
        expect(screen.getByText(description)).toBeInTheDocument();
        expect(await screen.findByText(expectedCategory)).toBeInTheDocument();
      },
    );

    it("shows the Dutch text for every locale when it has no translations", () => {
      for (const locale of ["nl", "fr", "en"] as const) {
        vi.mocked(getLocale).mockReturnValue(locale);
        const { unmount } = renderSchedule(<Schedule events={[mockEvents[0]!]} />);
        expect(screen.getByRole("heading", { name: "Winery Tour" })).toBeInTheDocument();
        unmount();
      }
    });
  });
});
