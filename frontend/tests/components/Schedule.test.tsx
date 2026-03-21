import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Schedule from "@/components/Schedule";

vi.mock("@/paraglide/messages", () => ({
  m: {
    schedule_days_friday: () => "Friday",
    schedule_days_saturday: () => "Saturday",
    schedule_days_sunday: () => "Sunday",
    schedule_events_fri_tasting_title: () => "Champagne Tasting",
    schedule_events_fri_tasting_description: () => "Continuous champagne tasting.",
    schedule_events_fri_vip_title: () => "VIP Reception",
    schedule_events_fri_vip_description: () => "Exclusive VIP reception.",
    schedule_events_fri_end_title: () => "End of Friday",
    schedule_events_fri_end_description: () => "Festival closes on Friday.",
    schedule_events_sat_exchange_title: () => "Exchange Market",
    schedule_events_sat_exchange_description: () => "Collector exchange market.",
    schedule_events_sat_opening_title: () => "Saturday Opening",
    schedule_events_sat_opening_description: () => "Official Saturday opening.",
    schedule_events_sat_party_title: () => "Champagne Party",
    schedule_events_sat_party_description: () => "Party with DJ.",
    schedule_events_sat_end_title: () => "End of Saturday",
    schedule_events_sat_end_description: () => "Festival closes on Saturday.",
    schedule_events_sun_breakfast_title: () => "Champagne Breakfast",
    schedule_events_sun_breakfast_description: () => "Charity champagne breakfast.",
    schedule_events_sun_opening_title: () => "Sunday Opening",
    schedule_events_sun_opening_description: () => "Official Sunday opening.",
    schedule_events_sun_end_title: () => "End of Sunday",
    schedule_events_sun_end_description: () => "Festival closes on Sunday.",
    schedule_start_time: () => "Start time",
    schedule_end_time: () => "End time",
    schedule_time_range: ({ start, end }: { start: string; end: string }) => `${start} - ${end}`,
    schedule_time: () => "Time",
    schedule_reservation: () => "Reservation required",
    schedule_presenter: () => "Presenter",
    schedule_location: () => "Location",
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
  { id: 1, date: "2025-10-03", label: "friday" },
  { id: 2, date: "2025-10-04", label: "saturday" },
  { id: 3, date: "2025-10-05", label: "sunday" },
];

const mockEvents = [
  {
    id: "fri-tasting",
    title: "Tasting",
    startTime: "17:00",
    endTime: "23:00",
    description: "Tasting event",
    category: "tasting" as const,
    dayId: 1,
  },
  {
    id: "fri-vip",
    title: "VIP",
    startTime: "19:30",
    description: "VIP event",
    category: "vip" as const,
    dayId: 1,
    reservation: true,
  },
  {
    id: "sat-party",
    title: "Party",
    startTime: "20:00",
    description: "Party event",
    category: "party" as const,
    dayId: 2,
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
    expect(screen.getByText("Champagne Tasting")).toBeInTheDocument();
    expect(screen.getByText("VIP Reception")).toBeInTheDocument();
  });

  it("shows reservation badge for events that require reservation", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByText("Reservation required")).toBeInTheDocument();
  });

  it("shows category badge", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByText("Tasting")).toBeInTheDocument();
  });

  it("switches to Saturday tab and shows Saturday events", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    fireEvent.click(screen.getByText("Saturday"));
    expect(screen.getByText("Champagne Party")).toBeInTheDocument();
  });

  it("shows no events message when a day has no events", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    // Sunday has no events in our mock
    fireEvent.click(screen.getByText("Sunday"));
    expect(screen.getByText("No events")).toBeInTheDocument();
  });

  it("derives a localized weekday label for non-festival day names", () => {
    render(
      <Schedule
        days={[{ id: 1, date: "2025-10-06", label: "monday" }]}
        events={[]}
      />,
    );
    expect(screen.getByText("maandag")).toBeInTheDocument();
  });

  it("displays start and end times for events", () => {
    render(<Schedule days={mockDays} events={mockEvents} />);
    expect(screen.getByText("17:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
  });
});
