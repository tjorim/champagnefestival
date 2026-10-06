import { useMemo } from "react";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { Registration } from "@/types/registration";
import { isRegistrationInEdition } from "@/utils/adminUtils";
import { toLocalDateKey } from "@/utils/dateUtils";
import { useTodayKey } from "@/hooks/useTodayKey";

interface UseAdminDashboardDataOptions {
  activeEdition: ActiveEdition;
  registrations: Registration[];
}

export function useAdminDashboardData({
  activeEdition,
  registrations,
}: UseAdminDashboardDataOptions) {
  const todayKey = useTodayKey();
  const activeEditionDateKeys = useMemo(
    () => activeEdition.dates.map((date) => toLocalDateKey(date)),
    [activeEdition.dates],
  );
  const activeDayIndex = activeEditionDateKeys.indexOf(todayKey);
  const isActiveEditionDay = activeDayIndex >= 0;

  const activeEditionStats = useMemo(() => {
    let checkedIn = 0;
    let total = 0;
    const eventIdsToday = new Set(
      activeEdition.events.filter((event) => event.date === todayKey).map((event) => event.id),
    );

    for (const registration of registrations) {
      if (registration.status === "cancelled") continue;
      if (!isRegistrationInEdition(registration, activeEdition.id)) continue;
      const guestCount = Math.max(0, registration.guestCount ?? 0);
      total += guestCount;
      if (registration.checkedIn) checkedIn += guestCount;
    }

    return { checkedIn, total, eventsToday: eventIdsToday.size };
  }, [activeEdition.events, activeEdition.id, registrations, todayKey]);

  const layoutDayOptions = useMemo(() => {
    return [...activeEdition.events]
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
      .map((event) => ({
        eventId: event.id,
        date: event.date,
        label: `${event.title} — ${new Date(`${event.date}T00:00:00`).toLocaleDateString()} ${event.startTime}`,
      }));
  }, [activeEdition.events]);

  return {
    activeDayIndex,
    activeEditionDateKeys,
    activeEditionStats,
    isActiveEditionDay,
    layoutDayOptions,
    todayKey,
  };
}
