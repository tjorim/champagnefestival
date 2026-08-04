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

import { render, screen, waitFor } from "@testing-library/react";
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
  description: "Join us for the grand opening.",
  date: "2027-03-07",
  startTime: "18:00",
  endTime: "22:00",
  category: "ceremony",
  allowPreorders: false,
  registrationRequired: false,
  active: true,
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
  contactPersonId: null,
  contactPerson: null,
} as unknown as ItemDraft;

function withQuery(ui: React.ReactElement) {
  return <QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>;
}

/** The modals render through a portal, so query the document rather than the container. */
function modalInputValues(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(".modal-body input.form-control"),
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
    );

    await waitFor(() => {
      expect(screen.getByLabelText("admin_content_event_title")).toHaveValue("Grand Opening");
    });
    expect(screen.getByLabelText("admin_content_event_start_time")).toHaveValue("18:00");
    expect(screen.getByLabelText("admin_content_event_end_time")).toHaveValue("22:00");
    expect(screen.getByLabelText("admin_event_date")).toHaveValue("2027-03-07");
  });

  it("EditionModal keeps the edition's values after the exhibitors query settles", async () => {
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

    // The exhibitors query re-renders the modal; the record must survive that.
    await waitFor(() => {
      expect(screen.queryByText("admin_edition_loading_exhibitors")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Month")).toHaveValue("march");
    expect(screen.getByLabelText("Year")).toHaveValue(2027);
    expect(screen.getByLabelText("admin_edition_venue_label")).toHaveValue("venue-01");
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

    expect(screen.getByLabelText("admin_edition_venue_label")).toHaveValue("");

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
      expect(screen.getByLabelText("admin_edition_venue_label")).toHaveValue("venue-01");
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
    expect(screen.getByLabelText("admin_item_type")).toHaveValue("producer");
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
    render(<VolunteerFormModal show volunteer={existingPerson} onSave={vi.fn()} onHide={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/registration_name/)).toHaveValue("Alice Dupont");
    });
    expect(screen.getByLabelText("admin_people_address_label")).toHaveValue("1 Rue de la Paix");
    // Help periods are a field array — the record's period must survive too.
    expect(modalInputValues()).toContain("2027-03-06");
  });
});
