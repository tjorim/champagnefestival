import React, { useMemo } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { useNow } from "@/hooks/useNow";
import { dayjs } from "@/utils/dateUtils";
import { m } from "@/paraglide/messages";

/**
 * Props for the Countdown component
 */
interface CountdownProps {
  targetDate: string | Date;
  endDate: Date;
  autoHideAfterDays?: number; // Days after festival end to auto-hide the countdown
}

/**
 * Structure for time remaining until target date
 * All properties are optional since they won't exist after the target date
 */
interface TimeLeft {
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

/**
 * Time units in milliseconds for conversion
 * Note: Month is calculated using date arithmetic, not a fixed value
 */
const TIME_UNITS = {
  day: 1000 * 60 * 60 * 24,
  hour: 1000 * 60 * 60,
  minute: 1000 * 60,
  second: 1000,
} as const;

/**
 * Status of the festival countdown
 */
const COUNTDOWN_STATUS = {
  upcoming: "upcoming", // Festival is in the future
  current: "current", // Festival is happening now
  concluded: "concluded", // Festival just ended (within grace period)
  hidden: "hidden", // Festival ended long ago, don't show anything
} as const;

type CountdownStatus = (typeof COUNTDOWN_STATUS)[keyof typeof COUNTDOWN_STATUS];

/**
 * Countdown component that displays time remaining until a target date
 * Features:
 * - Dynamic countdown to festival start date
 * - Different states for upcoming, current, and concluded festival
 * - Auto-hides after a configurable period following the festival
 * - Full accessibility support with ARIA attributes
 * - Client-side only rendering to prevent hydration mismatches
 */
const Countdown: React.FC<CountdownProps> = ({ targetDate, endDate, autoHideAfterDays = 30 }) => {
  const mounted = useHydrated();
  const now = useNow(1000);
  const targetDateObj = useMemo(() => {
    const date = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
    if (Number.isNaN(date.getTime())) throw new Error("Invalid countdown target date");
    return date;
  }, [targetDate]);
  const t = {
    months: m.countdown_months(),
    days: m.countdown_days(),
    hours: m.countdown_hours(),
    minutes: m.countdown_minutes(),
    seconds: m.countdown_seconds(),
  };
  type TimeUnitsTranslations = typeof t;
  const timeLeft: TimeLeft = {};
  const difference = targetDateObj.getTime() - now;
  if (difference > 0) {
    const target = dayjs(targetDateObj);
    const nowDate = dayjs(now);
    const months = target.diff(nowDate, "month");
    const remaining = target.diff(nowDate.add(months, "month"), "millisecond");
    const days = Math.floor(remaining / TIME_UNITS.day);
    const hours = Math.floor((remaining % TIME_UNITS.day) / TIME_UNITS.hour);
    const minutes = Math.floor((remaining % TIME_UNITS.hour) / TIME_UNITS.minute);
    const seconds = Math.floor((remaining % TIME_UNITS.minute) / TIME_UNITS.second);
    if (months > 0) Object.assign(timeLeft, { months, days, hours });
    else if (days > 0) Object.assign(timeLeft, { days, hours, minutes });
    else Object.assign(timeLeft, { hours, minutes, seconds });
  }
  const hideDate = new Date(endDate);
  hideDate.setDate(hideDate.getDate() + autoHideAfterDays);
  const status: CountdownStatus = !mounted
    ? COUNTDOWN_STATUS.upcoming
    : now < targetDateObj.getTime()
      ? COUNTDOWN_STATUS.upcoming
      : now <= endDate.getTime()
        ? COUNTDOWN_STATUS.current
        : now <= hideDate.getTime()
          ? COUNTDOWN_STATUS.concluded
          : COUNTDOWN_STATUS.hidden;

  // Map time units to display components
  const timerComponents = Object.entries(timeLeft).map(([unit, value]) => (
    <div key={unit} className="countdown-unit">
      <span className="countdown-value">{value}</span>
      <span className="countdown-label">{t[unit as keyof TimeUnitsTranslations] || unit}</span>
    </div>
  ));

  // Don't render anything if the status is HIDDEN
  if (status === COUNTDOWN_STATUS.hidden) {
    return null;
  }

  return (
    <div
      className={`countdown countdown-${status.toLowerCase()}`}
      aria-live="polite" // Announce updates to screen readers
    >
      {!mounted ? (
        <span className="countdown-loading">{m.countdown_loading()}</span>
      ) : status === COUNTDOWN_STATUS.concluded ? (
        // Festival just concluded
        <span className="countdown-concluded">{m.countdown_concluded()}</span>
      ) : status === COUNTDOWN_STATUS.current ? (
        // Festival is happening now
        <span className="countdown-current">{m.countdown_happening()}</span>
      ) : // Upcoming festival with countdown
      timerComponents.length ? (
        <div className="countdown-units">{timerComponents}</div>
      ) : (
        <span className="countdown-complete">{m.countdown_started()}</span>
      )}
    </div>
  );
};

export default Countdown;
