import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Countdown from '@/components/Countdown';

vi.mock('@/paraglide/messages', () => ({
  m: {
    countdown_months: () => 'months',
    countdown_days: () => 'days',
    countdown_hours: () => 'hours',
    countdown_minutes: () => 'minutes',
    countdown_seconds: () => 'seconds',
    countdown_loading: () => 'Loading...',
    countdown_concluded: () => 'Festival concluded',
    countdown_happening: () => 'Happening now!',
    countdown_started: () => 'Started!',
  },
}));

// festivalEndDate is 7 days in the future
vi.mock('@/config/dates', () => ({
  festivalEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
}));

describe('Countdown component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders countdown div with aria-live polite attribute', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={futureDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    const countdownDiv = document.querySelector('.countdown');
    expect(countdownDiv).toBeInTheDocument();
    expect(countdownDiv).toHaveAttribute('aria-live', 'polite');
  });

  it('shows upcoming countdown after mounting for far future date', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={futureDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector('.countdown-upcoming')).toBeInTheDocument();
  });

  it('shows "happening now" when targetDate is past but festivalEndDate is in the future', async () => {
    // targetDate = 1 day ago, festivalEndDate = 7 days in future (from mock)
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={pastDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Happening now!')).toBeInTheDocument();
  });

  it('throws error for invalid date string', () => {
    expect(() => render(<Countdown targetDate="not-a-date" />)).toThrow();
  });

  it('accepts a Date object as targetDate', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={futureDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector('.countdown')).toBeInTheDocument();
  });

  it('uses autoHideAfterDays prop', async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={futureDate} autoHideAfterDays={60} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector('.countdown')).toBeInTheDocument();
  });

  it('renders countdown container with correct class', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    render(<Countdown targetDate={futureDate} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    const container = document.querySelector('.countdown');
    expect(container).toBeInTheDocument();
  });
});
