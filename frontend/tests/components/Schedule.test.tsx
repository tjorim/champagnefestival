import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Schedule from "@/components/Schedule";

vi.mock("@/paraglide/messages", () => ({
  m: {
    schedule_days_friday: () => "Friday",
    schedule_days_saturday: () => "Saturday",
    schedule_days_sunday: () => "Sunday",
    schedule_start_time: () => "Start time",
    schedule_end_time: () => "End time",
    schedule_time_range: ({ start, end }: { start: string; end: string }) => `${start} - ${end}`,
    schedule_time: () => "Time",
    schedule_reservation: () => "Reservation required",
    schedule_no_events: () => "No events",
    schedule_categories_tasting: () => "Tasting",
    schedule_categories_vip: () => "VIP",
    schedule_categories_party: () => "Party",
    schedule_categories_breakfast: () => "Breakfast",
    schedule_categories_exchange: () => "Exchange",
    schedule_categories_general: () => "General",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: vi.fn().mockReturnValue("nl"),
  setLocale: vi.fn(),
  isLocale: vi.fn().mockReturnValue(true),
}));

const mockDays = [
  { id: 1, date: "2025-10-03" },
  { id: 2, date: "2025-10-04" },
  { id: 3, date: "2025-10-05" },
];

const mockEvents = [
  {
    id: "fri-tasting",
    title: "Tasting",
    startTime: "17:00",
    endTime: "23:00",
    description: "Tasting event",
    category: "tasting" as const,
    date: "2025-10-03",
    registrationRequired: false,
  },
  {
    id: "fri-vip",
    title: "VIP",
    startTime: "19:30",
    description: "VIP event",
    category: "vip" as const,
    date: "2025-10-03",
    registrationRequired: true,
  },
  {
    id: "sat-party",
    title: "Party",
    startTime: "20:00",
    description: "Party event",
    category: "party" as const,
    date: "2025-10-04",
    registrationRequired: false,
  },
];

describe("Schedule component", () => {
  it("renders day tabs", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByText("Friday")).toBeInTheDocument();
    expect(screen.getByText("Saturday")).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
  });

  it("renders events for the default active day (Friday)", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByRole("heading", { name: "Tasting" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "VIP" })).toBeInTheDocument();
  });

  it("shows reservation badge for events that require reservation", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByText("Reservation required")).toBeInTheDocument();
  });

  it("shows category badge", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByText("Tasting", { selector: ".badge" })).toBeInTheDocument();
  });

  it("switches to Saturday tab and shows Saturday events", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    fireEvent.click(screen.getByText("Saturday"));
    expect(screen.getByRole("heading", { name: "Party" })).toBeInTheDocument();
  });

  it("shows no events message when a day has no events", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    fireEvent.click(screen.getByText("Sunday"));
    expect(screen.getByText("No events")).toBeInTheDocument();
  });

  it("derives a localized weekday label for non-festival dates", () => {
    render(<Schedule days={[{ id: 1, date: "2025-10-06" }]} events={[]} />);
    expect(screen.getByText("maandag")).toBeInTheDocument();
  });

  it("displays start and end times for events", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByText("17:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
  });

  it("renders the backend-provided title and description for known legacy ids", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByRole("heading", { name: "Tasting" })).toBeInTheDocument();
    expect(screen.getByText("Tasting event")).toBeInTheDocument();
  });
});
