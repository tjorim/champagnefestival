import { useMemo } from "react";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { Person } from "@/types/person";
import type { Registration } from "@/types/registration";
import { isRegistrationInEdition } from "@/utils/adminUtils";
import { toLocalDateKey } from "@/utils/dateUtils";

interface UseAdminDashboardDataOptions {
  activeEdition: ActiveEdition;
  detailRegistration: Registration | null;
  people: Person[];
  registrations: Registration[];
}

export function useAdminDashboardData({
  activeEdition,
  detailRegistration,
  people,
  registrations,
}: UseAdminDashboardDataOptions) {
  const todayKey = useMemo(() => toLocalDateKey(new Date()), []);
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
    const uniqueDates = [...new Set(activeEdition.events.map((event) => event.date))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return uniqueDates.map((date) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    }));
  }, [activeEdition.events]);

  const registrationCountByPersonId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const registration of registrations) {
      if (registration.personId == null) continue;
      counts[registration.personId] = (counts[registration.personId] ?? 0) + 1;
    }
    return Object.fromEntries(people.map((person) => [person.id, counts[person.id] ?? 0]));
  }, [people, registrations]);

  const volunteers = useMemo(
    () => people.filter((person) => person.roles.includes("volunteer")),
    [people],
  );

  const emailDuplicates = useMemo(() => {
    if (!detailRegistration || !detailRegistration.person.email) return [];
    const personEmail = detailRegistration.person.email.toLowerCase();
    return people
      .filter(
        (person) =>
          person.id !== detailRegistration.personId &&
          person.email &&
          person.email.toLowerCase() === personEmail,
      )
      .map((person) => ({ id: person.id, name: person.name }));
  }, [detailRegistration, people]);

  return {
    activeDayIndex,
    activeEditionDateKeys,
    activeEditionStats,
    emailDuplicates,
    isActiveEditionDay,
    layoutDayOptions,
    registrationCountByPersonId,
    todayKey,
    volunteers,
  };
}
