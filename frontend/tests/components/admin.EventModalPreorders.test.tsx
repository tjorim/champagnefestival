/**
 * Regression coverage for EventModal's "allow pre-orders" toggle, which
 * replaced a magic-string check on the free-text `category` field
 * (`category === "vip"`). Proves the checkbox both prefills from an existing
 * event and reaches onSave — independent of whatever category is set.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EventModal from "@/components/admin/EventModal";
import type { Edition } from "@/components/admin/editionTypes";
import type { Event } from "@/types/event";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const edition = {
  id: "march-2027",
  year: 2027,
  month: "march",
  editionType: "festival",
  active: true,
  dates: ["2027-03-06", "2027-03-07", "2027-03-08"],
  venue: { id: "venue-01", name: "Brussels Expo", city: "Brussels", active: true },
  events: [],
} as unknown as Edition;

function existingEvent(overrides: Partial<Event>): Event {
  return {
    id: "event-01",
    editionId: "march-2027",
    title: "Capsule exchange",
    description: "",
    date: "2027-03-07",
    startTime: "10:00",
    category: "exchange",
    allowPreorders: false,
    registrationRequired: false,
    active: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as unknown as Event;
}

describe("EventModal allow-preorders toggle", () => {
  it("prefills unchecked for a non-vip event that does not allow pre-orders", async () => {
    render(
      <EventModal
        show
        edition={edition}
        initial={existingEvent({ category: "exchange", allowPreorders: false })}
        onSave={vi.fn()}
        onHide={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("admin_content_event_title")).toHaveValue("Capsule exchange");
    });
    expect(screen.getByLabelText("admin_content_event_allow_preorders")).not.toBeChecked();
  });

  it("prefills checked for a non-vip event that does allow pre-orders", async () => {
    // A Sunday-morning capsule exchange during the festival: not "vip", but
    // the admin has enabled ordering for it anyway.
    render(
      <EventModal
        show
        edition={edition}
        initial={existingEvent({ category: "exchange", allowPreorders: true })}
        onSave={vi.fn()}
        onHide={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("admin_content_event_allow_preorders")).toBeChecked();
    });
    // The category itself is untouched by the toggle.
    expect(screen.getByLabelText("admin_content_event_category")).toHaveValue("exchange");
  });

  it("submits the toggled value regardless of category", async () => {
    const onSave = vi.fn();
    render(
      <EventModal
        show
        edition={edition}
        initial={existingEvent({ category: "vip", allowPreorders: false })}
        onSave={onSave}
        onHide={vi.fn()}
      />,
    );

    const checkbox = await screen.findByLabelText("admin_content_event_allow_preorders");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /admin_save/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const submitted = onSave.mock.calls[0]![0] as { allowPreorders: boolean; category: string };
    expect(submitted.allowPreorders).toBe(true);
    // Toggling pre-orders does not silently rewrite category to "vip" or
    // anything else — the two fields are independent.
    expect(submitted.category).toBe("vip");
  });
});
