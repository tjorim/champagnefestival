import React, { useState, useEffect, useRef, useMemo } from "react";
import { m } from "../paraglide/messages";
import { festivalEndDate } from "../config/dates";

/**
 * Props for the Countdown component
 */
interface CountdownProps {
  targetDate: string | Date;
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
const Countdown: React.FC<CountdownProps> = ({ targetDate, autoHideAfterDays = 30 }) => {
  const [mounted, setMounted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({});
  const [status, setStatus] = useState<CountdownStatus>(COUNTDOWN_STATUS.upcoming);

  // Convert string date to Date object if needed
  // Wrapped in useMemo to avoid dependency changes on every render
  const targetDateObj = useMemo(() => {
    if (typeof targetDate === "string") {
      const date = new Date(targetDate);
      if (isNaN(date.getTime())) {
        throw new Error(
          `Invalid date provided to Countdown component: "${targetDate}". Please provide a valid date string or Date object.`,
        );
      }
      return date;
    }
    return targetDate;
  }, [targetDate]);

  // Use refs to avoid dependency cycles
  interface TimeUnitsTranslations {
    months: string;
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
  }

  const tRef = useRef<TimeUnitsTranslations | null>(null);
  const targetDateObjRef = useRef(targetDateObj);

  // Update refs when values change
  useEffect(() => {
    targetDateObjRef.current = targetDateObj;
  }, [targetDateObj]);

  // Set translation ref on mount
  useEffect(() => {
    tRef.current = {
      months: m.countdown_months(),
      days: m.countdown_days(),
      hours: m.countdown_hours(),
      minutes: m.countdown_minutes(),
      seconds: m.countdown_seconds(),
    };
  }, []);
  // Set component as mounted after initial render
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update countdown every second, but only after component is mounted and translations are loaded
  useEffect(() => {
    if (!mounted) return;

    // Track the last minute when status was updated
    let lastStatusUpdateMinute = -1;

    // Helper function to calculate time left (moved inside effect)
    const calculateTime = (): TimeLeft => {
      if (!tRef.current) return {};

      const targetDate = targetDateObjRef.current;
      const now = Date.now();
      const difference = targetDate.getTime() - now;

      if (difference > 0) {
        // Calculate months using proper date arithmetic
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();
        const nowDate = new Date(now);
        const nowMonth = nowDate.getMonth();
        const nowYear = nowDate.getFullYear();

        let months = (targetYear - nowYear) * 12 + (targetMonth - nowMonth);

        // Create a date that's 'months' away from now for accurate day calculation
        const tempDate = new Date(nowDate);
        tempDate.setMonth(tempDate.getMonth() + months);

        // If tempDate is after targetDate, we need to reduce months by 1
        if (tempDate.getTime() > targetDate.getTime()) {
          months = months - 1;
          tempDate.setMonth(nowDate.getMonth() + months);
        }

        const remainingMs = targetDate.getTime() - tempDate.getTime();
        const days = Math.floor(remainingMs / TIME_UNITS.day);
        const hours = Math.floor((remainingMs % TIME_UNITS.day) / TIME_UNITS.hour);
        const minutes = Math.floor((remainingMs % TIME_UNITS.hour) / TIME_UNITS.minute);
        const seconds = Math.floor((remainingMs % TIME_UNITS.minute) / TIME_UNITS.second);

        // Always show exactly 3 boxes for consistent layout
        const result: TimeLeft = {};

        if (months > 0) {
          result.months = months;
          result.days = days;
          result.hours = hours;
        } else if (days > 0) {
          result.days = days;
          result.hours = hours;
          result.minutes = minutes;
        } else {
          result.hours = hours;
          result.minutes = minutes;
          result.seconds = seconds;
        }

        return result;
      }

      return {};
    };

    // Helper function to determine status (moved inside effect)
    const calculateStatus = (): CountdownStatus => {
      const now = new Date();
      const festivalStart = targetDateObjRef.current;
      const festivalEnd = new Date(festivalEndDate); // already at 23:59:59.999

      if (now < festivalStart) {
        return COUNTDOWN_STATUS.upcoming;
      }

      if (now >= festivalStart && now <= festivalEnd) {
        return COUNTDOWN_STATUS.current;
      }

      const hideDate = new Date(festivalEnd);
      hideDate.setDate(hideDate.getDate() + autoHideAfterDays);

      if (now <= hideDate) {
        return COUNTDOWN_STATUS.concluded;
      }

      return COUNTDOWN_STATUS.hidden;
    };

    // Initial calculation and status determination
    if (tRef.current) {
      setTimeLeft(calculateTime());
      setStatus(calculateStatus());
      lastStatusUpdateMinute = new Date().getMinutes();
    }

    // Update timeLeft every second and status every minute
    const timer = setInterval(() => {
      if (tRef.current) {
        setTimeLeft(calculateTime());
      }

      // Update status when minute changes
      const currentMinute = new Date().getMinutes();
      if (currentMinute !== lastStatusUpdateMinute && tRef.current) {
        setStatus(calculateStatus());
        lastStatusUpdateMinute = currentMinute;
      }
    }, 1000);

    // Clean up interval on unmount
    return () => {
      clearInterval(timer);
    };
  }, [mounted, autoHideAfterDays]);

  // Map time units to display components
  const timerComponents = Object.entries(timeLeft).map(([unit, value]) => (
    <div key={unit} className="countdown-unit">
      <span className="countdown-value">{value}</span>
      <span className="countdown-label">
        {tRef.current?.[unit as keyof TimeUnitsTranslations] || unit}
      </span>
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
