import { useEffect, useState } from "react";
import { toLocalDateKey } from "@/utils/dateUtils";

/**
 * Today's local date key (`YYYY-MM-DD`), kept current across midnight.
 *
 * The admin dashboard is left open for a whole festival day at a time, so a key
 * captured once at mount goes stale and silently misfilters the "today" views.
 * This schedules a single timer to the next local midnight and re-arms it.
 */
export function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(() => toLocalDateKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNextMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      // +1s of slack so the timer never lands a hair before the date rolls over.
      timer = setTimeout(
        () => {
          setTodayKey(toLocalDateKey(new Date()));
          scheduleNextMidnight();
        },
        nextMidnight.getTime() - now.getTime() + 1000,
      );
    };

    scheduleNextMidnight();
    return () => clearTimeout(timer);
  }, []);

  return todayKey;
}
