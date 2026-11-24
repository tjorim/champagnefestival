import { editionOut, eventOut, venueOut } from "@/mocks/data/builders";
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

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import EditionModal from "@/features/admin/editions/EditionModal";
import EventModal from "@/features/admin/editions/EventModal";
import OrganizationModal from "@/features/admin/organizations/OrganizationModal";
import { seedOrganizations } from "@/mocks/data/organizations";
import MemberFormModal from "@/features/admin/people/MemberFormModal";
import PersonFormModal from "@/features/admin/people/PersonFormModal";
import VolunteerFormModal from "@/features/admin/people/VolunteerFormModal";

import type { Organization, Venue } from "@/api-types";

import type { Person } from "@/types/person";
import { createTestQueryClient } from "../../../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

// The mocked messages echo their key and arguments.
const TITLE_NL = 'admin_event_title_label({"language":"admin_language_nl"})';
const TITLE_FR = 'admin_event_title_label({"language":"admin_language_fr"})';
const TITLE_EN = 'admin_event_title_label({"language":"admin_language_en"})';

const venues = [
  { id: "venue-01", name: "Brussels Expo", city: "Brussels", active: true },
] as unknown as Venue[];

const edition = editionOut({
  id: "march-2027",
  year: 2027,
  month: "march",
  edition_type: "festival",
  active: true,
  dates: ["2027-03-06", "2027-03-07", "2027-03-08"],
  venue: venueOut({ id: "venue-01", name: "Brussels Expo", city: "Brussels" }),
  events: [],
  producers: [],
  sponsors: [],
  vendors: [],
});

const existingEvent = eventOut({
  id: "event-01",
  edition_id: "march-2027",
  title: "Grand Opening",

  title_nl: "Grote opening",
  title_fr: null,
  title_en: "Grand Opening",

  description_nl: null,
  description_fr: null,
  description_en: "Join us for the grand opening.",
  description: "Join us for the grand opening.",
  date: "2027-03-07",
  start_time: "18:00",
  end_time: "22:00",
  category: "ceremony",
  registration_required: false,
  active: true,
  products: [],
});

const existingPerson = {
  id: "person-01",
  name: "Alice Dupont",
  email: "alice@example.com",
  phone: "0400000000",
  address: "1 Rue de la Paix",
  roles: ["member"],
  notes: "VIP",
  anonymised: false,
  retired_roles: {},
  role_history: { member: [{ started_on: "2021-04-02", ended_on: null }] },
  help_periods: [{ id: "hp-1", first_help_day: "2027-03-06", last_help_day: "2027-03-08" }],
} as unknown as Person;

const existingItem = {
  id: 1,
  name: "Maison Moët & Chandon",
  image: "/img/moet.png",
  website: "https://example.com",
  type: "producer",
  active: true,
  contact_person_id: "person-01",
  contact_person: {
    id: "person-01",
    name: "Alice Dupont",
    email: "alice@example.com",
    phone: "0400000000",
  },
} as unknown as Organization;

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
        initial={{ ...existingEvent, id: "event-02", title_en: "Second event" }}
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
          organizations={seedOrganizations}
          onSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    // The organizations query re-renders the modal; the record must survive that.
    await waitFor(() => {
      expect(screen.queryByText("admin_edition_loading_organizations")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("admin_edition_month_label")).toHaveTextContent(
      /march|maart|mars/i,
    );
    expect(screen.getByLabelText("admin_edition_year_label")).toHaveValue(2027);
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
          organizations={[]}
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
          organizations={seedOrganizations}
          onSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("admin_edition_venue_label")).toHaveTextContent("Brussels Expo");
    });
  });

  it("OrganizationModal keeps the organization's values", async () => {
    render(
      withQuery(
        <OrganizationModal
          show
          initial={existingItem}
          onSave={vi.fn()}
          onLogoSaved={vi.fn()}
          onHide={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("admin_content_name_placeholder")).toHaveValue(
        "Maison Moët & Chandon",
      );
    });
    expect(screen.getByLabelText("organization_image_label")).toHaveValue("/img/moet.png");
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
    expect(screen.getByLabelText("admin_members_since_label")).toHaveValue("2021-04-02");
  });

  it("PersonFormModal keeps the person's values", async () => {
    render(<PersonFormModal show person={existingPerson} onSave={vi.fn()} onHide={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/registration_name/)).toHaveValue("Alice Dupont");
    });
    expect(screen.getByLabelText("registration_email")).toHaveValue("alice@example.com");
    const roles = screen.getByRole("group", { name: "admin_people_roles_label" });
    expect(
      within(roles).getByRole("button", { name: "admin_role_member", pressed: true }),
    ).toBeVisible();
    expect(
      within(roles).getByRole("button", { name: "admin_role_volunteer", pressed: false }),
    ).toBeVisible();
    expect(within(roles).getAllByRole("button")).toHaveLength(2);
    expect(within(roles).queryByRole("textbox")).toBeNull();
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
