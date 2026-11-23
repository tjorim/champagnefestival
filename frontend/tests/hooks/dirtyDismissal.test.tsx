import { editionOut, eventOut, venueOut } from "@/mocks/data/builders";
/**
 * Shared dismissal policy for the admin create/edit modals (#1428): a pristine
 * form closes at once, a dirty one asks "Discard changes?" whichever way it is
 * dismissed, and "Keep editing" leaves every field and the focus where they were.
 */

import { useState, type ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import EditionModal from "@/features/admin/editions/EditionModal";
import EventModal from "@/features/admin/editions/EventModal";
import ItemModal from "@/features/admin/editions/ItemModal";
import MemberFormModal from "@/features/admin/people/MemberFormModal";
import PersonFormModal from "@/features/admin/people/PersonFormModal";
import RegistrationCreateModal from "@/features/admin/registrations/RegistrationCreateModal";
import VolunteerFormModal from "@/features/admin/people/VolunteerFormModal";

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
const TITLE_NL = 'admin_event_title_label({"language":"admin_language_nl"})';

const edition = editionOut({
  id: "ux-2026",
  year: 2026,
  month: "october",
  edition_type: "festival",
  active: true,
  dates: ["2026-10-24"],
  venue: venueOut({ id: "venue-01", name: "Hall", city: "Brussels" }),
  events: [],
  producers: [],
  sponsors: [],
  vendors: [],
});

const event = eventOut({
  id: "event-01",
  edition_id: "ux-2026",
  title: "Herfstproeverij",
  title_nl: "Herfstproeverij",
  title_fr: null,
  title_en: null,
  description_nl: null,
  description_fr: null,
  description_en: null,
  date: "2026-10-24",
  start_time: "18:00",
  end_time: "22:00",
  category: "tasting",
  registration_required: false,
  active: true,
  products: [],
});

const person = {
  id: "person-01",
  name: "Alice Dupont",
  email: null,
  phone: null,
  address: null,
  roles: ["member"],
  notes: null,
  role_history: {},
  help_periods: [],
} as unknown as Person;

interface Case {
  name: string;
  modal: (show: boolean, onHide: () => void) => ReactElement;
  field: () => HTMLElement;
  typed: string;
  /** Value shown by `field` for a pristine form. */
  pristine: string;
}

const noop = vi.fn();

const cases: Case[] = [
  {
    name: "EventModal (edit)",
    modal: (show, onHide) => (
      <EventModal
        show={show}
        edition={edition}
        initial={event}
        authHeaders={authHeaders}
        onSave={noop}
        onHide={onHide}
      />
    ),
    field: () => screen.getByLabelText(TITLE_NL),
    typed: " — draft review",
    pristine: "Herfstproeverij",
  },
  {
    name: "PersonFormModal (create)",
    modal: (show, onHide) => (
      <PersonFormModal show={show} person={null} onSave={noop} onHide={onHide} />
    ),
    field: () => screen.getByLabelText(/registration_name/),
    typed: "Unsaved review person",
    pristine: "",
  },
  {
    name: "MemberFormModal (edit)",
    modal: (show, onHide) => (
      <MemberFormModal show={show} member={person} onSave={noop} onHide={onHide} />
    ),
    field: () => screen.getByLabelText(/registration_name/),
    typed: " Jr",
    pristine: "Alice Dupont",
  },
  {
    name: "VolunteerFormModal (create)",
    modal: (show, onHide) => (
      <VolunteerFormModal show={show} volunteer={null} onSave={noop} onHide={onHide} />
    ),
    field: () => screen.getByLabelText(/registration_name/),
    typed: "Draft volunteer",
    pristine: "",
  },
  {
    name: "ItemModal (create)",
    modal: (show, onHide) => (
      <ItemModal
        show={show}
        initial={null}
        authHeaders={authHeaders}
        onSave={noop}
        onHide={onHide}
      />
    ),
    field: () => screen.getByLabelText("admin_content_name_placeholder"),
    typed: "Draft item",
    pristine: "",
  },
  {
    name: "EditionModal (edit)",
    modal: (show, onHide) => (
      <EditionModal
        show={show}
        initial={edition}
        venues={[]}
        authHeaders={authHeaders}
        onSaved={noop}
        onHide={onHide}
      />
    ),
    field: () => screen.getByLabelText("admin_edition_year_label"),
    typed: "1",
    pristine: "2026",
  },
  {
    name: "RegistrationCreateModal",
    modal: (show, onHide) => (
      <RegistrationCreateModal
        show={show}
        authHeaders={authHeaders}
        onSaved={noop}
        onOpenBooking={noop}
        onHide={onHide}
      />
    ),
    field: () => screen.getByLabelText("admin_notes"),
    typed: "Draft note",
    pristine: "",
  },
];

function Host({ modal }: Pick<Case, "modal">) {
  const [show, setShow] = useState(true);
  return (
    <>
      <button onClick={() => setShow(true)}>reopen</button>
      {modal(show, () => setShow(false))}
    </>
  );
}

function renderHost(modal: Case["modal"]) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Host modal={modal} />
    </QueryClientProvider>,
  );
}

describe.each(cases)("$name dismissal", ({ modal, field, typed, pristine }) => {
  it("closes a pristine form on Escape without asking", async () => {
    const user = userEvent.setup();
    renderHost(modal);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("admin_editor_discard_title")).toBeNull();
  });

  it("asks on Escape once edited; Keep editing retains the draft and focus", async () => {
    const user = userEvent.setup();
    renderHost(modal);
    await screen.findByRole("dialog");
    await user.click(field());
    await user.keyboard(typed);
    const draft = (field() as HTMLInputElement).value;
    expect(draft).toBe(`${pristine}${typed}`);

    await user.keyboard("{Escape}");
    expect(await screen.findByText("admin_editor_discard_title")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "admin_editor_keep_editing" }));

    await waitFor(() => expect(screen.queryByText("admin_editor_discard_title")).toBeNull());
    expect((field() as HTMLInputElement).value).toBe(draft);
    await waitFor(() => expect(document.activeElement).toBe(field()));
  });

  it("asks for the explicit Cancel button too, and Discard changes closes and reseeds", async () => {
    const user = userEvent.setup();
    renderHost(modal);
    await screen.findByRole("dialog");
    await user.click(field());
    await user.keyboard(typed);

    // The footer's first button is the explicit Cancel/Close.
    await user.click(document.querySelector<HTMLElement>('[data-slot="dialog-footer"] button')!);
    await user.click(await screen.findByRole("button", { name: "admin_editor_discard_changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "reopen", hidden: true }));
    await screen.findByRole("dialog");
    expect((field() as HTMLInputElement).value).toBe(pristine);
  });

  it.each([
    [
      "header close button",
      () => document.querySelector<HTMLElement>('[data-slot="dialog-close"]')!,
    ],
    ["backdrop", () => document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!],
  ])("asks when dirty via the %s and closes when pristine", async (_name, target) => {
    const user = userEvent.setup();
    renderHost(modal);
    await screen.findByRole("dialog");
    await user.click(field());
    await user.keyboard(typed);
    await user.click(target());
    expect(await screen.findByText("admin_editor_discard_title")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "admin_editor_keep_editing" }));
    await waitFor(() => expect(screen.queryByText("admin_editor_discard_title")).toBeNull());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("dismissal while saving", () => {
  it("keeps a dirty editor open without asking while its save is pending", async () => {
    const user = userEvent.setup();
    const onHide = vi.fn();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ItemModal
          show
          initial={null}
          authHeaders={authHeaders}
          saving
          onSave={noop}
          onHide={onHide}
        />
      </QueryClientProvider>,
    );
    await user.type(await screen.findByLabelText("admin_content_name_placeholder"), "Draft item");
    await user.keyboard("{Escape}");

    expect(screen.queryByText("admin_editor_discard_title")).toBeNull();
    expect(onHide).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
