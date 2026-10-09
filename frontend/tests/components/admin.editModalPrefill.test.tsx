/**
 * Regression coverage for the admin edit modals hydrating from the record being
 * edited.
 *
 * `useForm` re-applies its `defaultValues` on every render (a layout effect in
 * @tanstack/react-form with no dependency array). When the modals passed a
 * static empty template and hydrated separately via `form.reset(record)`, that
 * re-application blanked the form a render later — every edit modal opened
 * empty, and saving wrote the blank values over the record.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import EditionModal from "@/components/admin/EditionModal";
import EventModal from "@/components/admin/EventModal";
import ItemModal from "@/components/admin/ItemModal";
import MemberFormModal from "@/components/admin/MemberFormModal";
import PersonFormModal from "@/components/admin/PersonFormModal";
import VolunteerFormModal from "@/components/admin/VolunteerFormModal";
import type { Edition } from "@/components/admin/editionTypes";
import type { ItemDraft } from "@/components/admin/itemTypes";
import type { Venue } from "@/types/admin";
import type { Event } from "@/types/event";
import type { Person } from "@/types/person";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

// The mocked messages echo their key and arguments.
const TITLE_NL = 'admin_event_title_label({"language":"admin_language_nl"})';
const TITLE_FR = 'admin_event_title_label({"language":"admin_language_fr"})';
const TITLE_EN = 'admin_event_title_label({"language":"admin_language_en"})';

const venues = [
  { id: "venue-01", name: "Brussels Expo", city: "Brussels", active: true },
] as unknown as Venue[];

const edition = {
  id: "march-2027",
  year: 2027,
  month: "march",
  editionType: "festival",
  active: true,
  dates: ["2027-03-06", "2027-03-07", "2027-03-08"],
  venue: { id: "venue-01", name: "Brussels Expo", city: "Brussels", active: true },
  events: [],
  producers: [],
  sponsors: [],
  vendors: [],
} as unknown as Edition;

const existingEvent = {
  id: "event-01",
  editionId: "march-2027",
  title: "Grand Opening",
  titleLanguage: "en",
  titleNl: "Grote opening",
  titleFr: null,
  titleEn: "Grand Opening",
  descriptionLanguage: "en",
  descriptionNl: null,
  descriptionFr: null,
  descriptionEn: "Join us for the grand opening.",
  description: "Join us for the grand opening.",
  date: "2027-03-07",
  startTime: "18:00",
  endTime: "22:00",
  category: "ceremony",
  registrationRequired: false,
  active: true,
  products: [],
} as unknown as Event;

const existingPerson = {
  id: "person-01",
  name: "Alice Dupont",
  email: "alice@example.com",
  phone: "0400000000",
  address: "1 Rue de la Paix",
  roles: ["member"],
  notes: "VIP",
  clubName: "Club A",
  active: true,
  helpPeriods: [{ id: "hp-1", firstHelpDay: "2027-03-06", lastHelpDay: "2027-03-08" }],
} as unknown as Person;

const existingItem = {
  id: 1,
  name: "Maison Moët & Chandon",
  image: "/img/moet.png",
  website: "https://example.com",
  type: "producer",
  active: true,
  contactPersonId: "person-01",
  contactPerson: {
    id: "person-01",
    name: "Alice Dupont",
    email: "alice@example.com",
    phone: "0400000000",
  },
} as unknown as ItemDraft;

function withQuery(ui: React.ReactElement) {
  return <QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>;
}

/** A stable client for a test's rerenders; the translation drafts query the capabilities endpoint. */
function queryWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** The modals render through a portal, so query the document rather than the container. */
function modalInputValues(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      '[data-slot="dialog-body"] input[data-slot="input"]',
    ),
  ).map((input) => input.value);
}

describe("admin edit modals prefill from the record being edited", () => {
  it("EventModal keeps the event's values after the form settles", async () => {
    render(
      <EventModal
        show
        edition={edition}
        initial={existingEvent}
        authHeaders={authHeaders}
        onSave={vi.fn()}
        onHide={vi.fn()}
      />,
      { wrapper: queryWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByLabelText(TITLE_EN)).toHaveValue("Grand Opening");
    });
    expect(screen.getByLabelText(TITLE_NL)).toHaveValue("Grote opening");
    expect(screen.getByLabelText(TITLE_FR)).toHaveValue("");
    expect(screen.getByLabelText("admin_content_event_start_time")).toHaveValue("18:00");
    expect(screen.getByLabelText("admin_content_event_end_time")).toHaveValue("22:00");
    expect(screen.getByLabelText("admin_event_date")).toHaveValue("2027-03-07");
  });

  it.each(["event", "dates"])(
    "EventModal preserves edits when %s identity refreshes",
    (changed) => {
      const props = {
        show: true,
        edition,
        initial: existingEvent,
        authHeaders,
        onSave: vi.fn(),
        onHide: vi.fn(),
      };
      const { rerender } = render(<EventModal {...props} />, { wrapper: queryWrapper() });
      const title = screen.getByLabelText(TITLE_EN);
      fireEvent.change(title, { target: { value: "Unsaved title" } });
      rerender(
        <EventModal
          {...props}
          initial={
            changed === "event"
              ? { ...existingEvent, description: "Updated on the server" }
              : existingEvent
          }
          edition={changed === "dates" ? { ...edition, dates: [...edition.dates] } : edition}
        />,
      );
      expect(title).toHaveValue("Unsaved title");
    },
  );

  it("EventModal resets on reopening and switching records while open", () => {
    const props = {
      show: true,
      edition,
      initial: existingEvent,
      authHeaders,
      onSave: vi.fn(),
      onHide: vi.fn(),
    };
    const { rerender } = render(<EventModal {...props} />, { wrapper: queryWrapper() });
    fireEvent.change(screen.getByLabelText(TITLE_EN), {
      target: { value: "Abandoned" },
    });
    rerender(<EventModal {...props} show={false} />);
    rerender(<EventModal {...props} />);
    expect(screen.getByLabelText(TITLE_EN)).toHaveValue("Grand Opening");
    fireEvent.change(screen.getByLabelText(TITLE_EN), {
      target: { value: "Another draft" },
    });
    rerender(
      <EventModal
        {...props}
        initial={{ ...existingEvent, id: "event-02", titleEn: "Second event" }}
      />,
    );
    expect(screen.getByLabelText(TITLE_EN)).toHaveValue("Second event");
    rerender(<EventModal {...props} initial={null} />);
    expect(screen.getByLabelText(TITLE_EN)).toHaveValue("");
  });

  it("EditionModal keeps the edition's values after the organizations query settles", async () => {
    render(
      withQuery(
        <EditionModal
          show
          initial={edition}
          venues={venues}
          authHeaders={authHeaders}
          onSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    // The organizations query re-renders the modal; the record must survive that.
    await waitFor(() => {
      expect(screen.queryByText("admin_edition_loading_organizations")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Month")).toHaveValue("march");
    expect(screen.getByLabelText("Year")).toHaveValue(2027);
    expect(screen.getByLabelText("admin_edition_venue_label")).toHaveTextContent("Brussels Expo");
  });

  it("EditionModal defaults a new edition's venue once the venues arrive", async () => {
    // `venues` is passed as `query.data ?? []`, so the modal mounts before the
    // list exists; the default must still land when it shows up.
    const { rerender } = render(
      withQuery(
        <EditionModal
          show
          initial={null}
          venues={[]}
          authHeaders={authHeaders}
          onSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    expect(screen.getByLabelText("admin_edition_venue_label")).toHaveTextContent(
      "admin_edition_venue_placeholder",
    );

    rerender(
      withQuery(
        <EditionModal
          show
          initial={null}
          venues={venues}
          authHeaders={authHeaders}
          onSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("admin_edition_venue_label")).toHaveTextContent("Brussels Expo");
    });
  });

  it("ItemModal keeps the item's values", async () => {
    render(
      withQuery(
        <ItemModal
          show
          initial={existingItem}
          authHeaders={authHeaders}
          onSave={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("admin_content_name_placeholder")).toHaveValue(
        "Maison Moët & Chandon",
      );
    });
    expect(screen.getByLabelText("admin_content_image_url_placeholder")).toHaveValue(
      "/img/moet.png",
    );
    expect(screen.getByLabelText("admin_item_type")).toHaveTextContent("admin_item_producer");
    expect(screen.getByRole("combobox", { name: "admin_item_contact_person" })).toHaveValue(
      "Alice Dupont",
    );
  });

  it("MemberFormModal keeps the member's values", async () => {
    render(<MemberFormModal show member={existingPerson} onSave={vi.fn()} onHide={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/registration_name/)).toHaveValue("Alice Dupont");
    });
    expect(screen.getByLabelText("registration_email")).toHaveValue("alice@example.com");
    expect(screen.getByLabelText("admin_people_address_label")).toHaveValue("1 Rue de la Paix");
  });

  it("PersonFormModal keeps the person's values", async () => {
    render(<PersonFormModal show person={existingPerson} onSave={vi.fn()} onHide={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/registration_name/)).toHaveValue("Alice Dupont");
    });
    expect(screen.getByLabelText("registration_email")).toHaveValue("alice@example.com");
    expect(screen.getByLabelText("admin_people_roles_label")).toHaveValue("member");
  });

  it("VolunteerFormModal keeps the volunteer's values", async () => {
    render(
      <VolunteerFormModal show volunteer={existingPerson} onSave={vi.fn()} onHide={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/registration_name/)).toHaveValue("Alice Dupont");
    });
    expect(screen.getByLabelText("admin_people_address_label")).toHaveValue("1 Rue de la Paix");
    // Help periods are a field array — the record's period must survive too.
    expect(modalInputValues()).toContain("2027-03-06");
  });
});
