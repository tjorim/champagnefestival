import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import RegistrationList from "@/components/admin/RegistrationList";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const mockActiveEdition: ActiveEdition = {
  id: "test-edition",
  year: 2025,
  month: "march",
  dates: [],
  venue: {
    venueName: "Test Venue",
    address: "123 Main St",
    city: "Ghent",
    postalCode: "9000",
    country: "BE",
    coordinates: { lat: 0, lng: 0 },
  },
  events: [],
  producers: [],
  sponsors: [],
};

function renderRegistrationList(
  { sectionError, onClearSectionError }: { sectionError?: string; onClearSectionError?: () => void } = {},
) {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <RegistrationList
        registrations={[]}
        tables={[]}
        exhibitors={[]}
        filter="all"
        onFilterChange={vi.fn()}
        onUpdateStatus={vi.fn()}
        onUpdatePayment={vi.fn()}
        onAssignTable={vi.fn()}
        onViewDetail={vi.fn()}
        onCheckIn={vi.fn()}
        onIssueStrap={vi.fn()}
        onAddRegistration={vi.fn()}
        authHeaders={() => ({})}
        activeEdition={mockActiveEdition}
        applyActiveEditionFilterRequest={0}
        sectionError={sectionError}
        onClearSectionError={onClearSectionError}
      />
    </QueryClientProvider>,
  );
}

describe("RegistrationList — scoped error display", () => {
  it("shows sectionError alert inline when a mutation fails", () => {
    renderRegistrationList({ sectionError: "Check-in failed." });
    expect(screen.getByRole("alert")).toHaveTextContent("Check-in failed.");
  });

  it("calls onClearSectionError when the alert is dismissed", () => {
    const onClear = vi.fn();
    renderRegistrationList({ sectionError: "Failed to assign table.", onClearSectionError: onClear });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders no error alert when sectionError is not provided", () => {
    renderRegistrationList();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
