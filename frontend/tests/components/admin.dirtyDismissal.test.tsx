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
import EditionModal from "@/components/admin/EditionModal";
import EventModal from "@/components/admin/EventModal";
import ItemModal from "@/components/admin/ItemModal";
import MemberFormModal from "@/components/admin/MemberFormModal";
import PersonFormModal from "@/components/admin/PersonFormModal";
import RegistrationCreateModal from "@/components/admin/RegistrationCreateModal";
import VolunteerFormModal from "@/components/admin/VolunteerFormModal";
import type { Edition } from "@/components/admin/editionTypes";
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
const TITLE_NL = 'admin_event_title_label({"language":"admin_language_nl"})';

const edition = {
  id: "ux-2026",
  year: 2026,
  month: "october",
  editionType: "festival",
  active: true,
  dates: ["2026-10-24"],
  venue: { id: "venue-01", name: "Hall", city: "Brussels", active: true },
  events: [],
  producers: [],
  sponsors: [],
  vendors: [],
} as unknown as Edition;

const event = {
  id: "event-01",
  editionId: "ux-2026",
  title: "Herfstproeverij",
  titleNl: "Herfstproeverij",
  titleFr: null,
  titleEn: null,
  descriptionNl: null,
  descriptionFr: null,
  descriptionEn: null,
  date: "2026-10-24",
  startTime: "18:00",
  endTime: "22:00",
  category: "tasting",
  registrationRequired: false,
  active: true,
  products: [],
} as unknown as Event;

const person = {
  id: "person-01",
  name: "Alice Dupont",
  email: null,
  phone: null,
  address: null,
  roles: ["member"],
  notes: null,
  roleHistory: {},
  helpPeriods: [],
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
    field: () => screen.getByLabelText("admin_edition_month_label"),
    typed: "x",
    pristine: "october",
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
