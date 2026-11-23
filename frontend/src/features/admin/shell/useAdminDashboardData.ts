import { getLocale } from "@/paraglide/runtime";
import { useMemo } from "react";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { Registration } from "@/types/registration";
import { isRegistrationInEdition } from "./adminUtils";
import { toLocalDateKey, formatDate, formatTime } from "@/lib/format/dateUtils";
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
      const guestCount = Math.max(0, registration.guest_count ?? 0);
      total += guestCount;
      if (registration.checked_in) checkedIn += guestCount;
    }

    return { checkedIn, total, eventsToday: eventIdsToday.size };
  }, [activeEdition.events, activeEdition.id, registrations, todayKey]);

  const locale = getLocale();
  const layoutDayOptions = useMemo(() => {
    return [...activeEdition.events]
      .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`))
      .map((event) => ({
        eventId: event.id,
        date: event.date,
        label: `${event.title} — ${formatDate(event.date, locale)} ${formatTime(event.start_time, locale)}`,
      }));
  }, [activeEdition.events, locale]);

  return {
    activeDayIndex,
    activeEditionDateKeys,
    activeEditionStats,
    isActiveEditionDay,
    layoutDayOptions,
    todayKey,
  };
}
