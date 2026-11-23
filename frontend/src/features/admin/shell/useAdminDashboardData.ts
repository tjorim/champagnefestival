import { useMemo } from "react";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { toLocalDateKey } from "@/lib/format/dateUtils";
import { useTodayKey } from "@/hooks/useTodayKey";

export function useAdminDashboardData(activeEdition: ActiveEdition) {
  const todayKey = useTodayKey();
  const activeEditionDateKeys = useMemo(
    () => activeEdition.dates.map((date) => toLocalDateKey(date)),
    [activeEdition.dates],
  );
  const activeDayIndex = activeEditionDateKeys.indexOf(todayKey);
  const isActiveEditionDay = activeDayIndex >= 0;

  const eventsToday = activeEdition.events.filter((event) => event.date === todayKey).length;

  const layoutDayOptions = useMemo(() => {
    return [...activeEdition.events]
      .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`))
      .map((event) => ({
        eventId: event.id,
        date: event.date,
        label: `${event.title} — ${new Date(`${event.date}T00:00:00`).toLocaleDateString()} ${event.start_time}`,
      }));
  }, [activeEdition.events]);

  return {
    activeDayIndex,
    activeEditionDateKeys,
    eventsToday,
    isActiveEditionDay,
    layoutDayOptions,
    todayKey,
  };
}
