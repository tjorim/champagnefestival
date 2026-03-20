import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Countdown from "@/components/Countdown";

vi.mock("@/paraglide/messages", () => ({
  m: {
    countdown_months: () => "months",
    countdown_days: () => "days",
    countdown_hours: () => "hours",
    countdown_minutes: () => "minutes",
    countdown_seconds: () => "seconds",
    countdown_loading: () => "Loading...",
    countdown_concluded: () => "Festival concluded",
    countdown_happening: () => "Happening now!",
    countdown_started: () => "Started!",
  },
}));

describe("Countdown component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders countdown div with aria-live polite attribute", async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { container } = render(<Countdown targetDate={futureDate} endDate={endDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    const countdownDiv = container.querySelector(".countdown");
    expect(countdownDiv).toBeInTheDocument();
    expect(countdownDiv).toHaveAttribute("aria-live", "polite");
  });

  it("shows upcoming countdown after mounting for far future date", async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { container } = render(<Countdown targetDate={futureDate} endDate={endDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(container.querySelector(".countdown-upcoming")).toBeInTheDocument();
  });

  it('shows "happening now" when targetDate is past but endDate is in the future', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={pastDate} endDate={endDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText("Happening now!")).toBeInTheDocument();
  });

  it('shows "concluded" when festival has ended but is within autoHideAfterDays', async () => {
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const pastStartDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={pastStartDate} endDate={endDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText("Festival concluded")).toBeInTheDocument();
  });

  it("renders nothing when festival ended and autoHideAfterDays has passed", async () => {
    const endDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const pastStartDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const { container } = render(<Countdown targetDate={pastStartDate} endDate={endDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(container.querySelector(".countdown")).toBeNull();
  });

  it("throws error for invalid date string", () => {
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(() => render(<Countdown targetDate="not-a-date" endDate={endDate} />)).toThrow();
  });

  it("accepts a Date object as targetDate", async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { container } = render(<Countdown targetDate={futureDate} endDate={endDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(container.querySelector(".countdown")).toBeInTheDocument();
  });

  it("uses autoHideAfterDays prop", async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { container } = render(
      <Countdown targetDate={futureDate} endDate={endDate} autoHideAfterDays={60} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(container.querySelector(".countdown")).toBeInTheDocument();
  });

  it("renders countdown container with correct class", async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { container } = render(<Countdown targetDate={futureDate} endDate={endDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    const countdownEl = container.querySelector(".countdown");
    expect(countdownEl).toBeInTheDocument();
    expect(countdownEl).toHaveAttribute("aria-live", "polite");
  });
});
