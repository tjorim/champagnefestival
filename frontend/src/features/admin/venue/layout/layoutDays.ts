import { getLocale } from "@/paraglide/runtime";
import { formatDate } from "@/lib/format/dateUtils";

export interface DayOption {
  eventId: string;
  date: string;
  label: string;
}

export function getInitialNewLayoutState(dayOptions: DayOption[]) {
  return {
    eventId: dayOptions[0]?.eventId ?? "",
    copyFromLayoutId: "",
    copyTables: true,
    copyAreas: true,
  };
}

export function getDayLabel(
  layout: { event_id: string | null; event_title?: string; date?: string | null; label?: string },
  dayOptions: DayOption[],
): string {
  const { event_id: eventId, event_title: eventTitle, date, label = "" } = layout;
  if (eventId) {
    const fromDayOptions = dayOptions.find((day) => day.eventId === eventId)?.label;
    if (fromDayOptions) return fromDayOptions;
  }
  // The event isn't in the active edition's day options — most likely a
  // layout from a different edition (e.g. "last year's breakfast" in the
  // cross-date compare picker). Fall back to the layout's own event title
  // rather than showing blank.
  if (eventTitle) {
    const formattedDate = date ? formatDate(date, getLocale()) : "";
    return formattedDate ? `${eventTitle} — ${formattedDate}` : eventTitle;
  }
  return label;
}
