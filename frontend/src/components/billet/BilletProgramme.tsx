import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { categoryLabel, useEventCategories } from "@/hooks/useCategories";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Event } from "@/types/event";
import { eventDescription, eventTitle } from "@/utils/eventText";

interface BilletProgrammeProps {
  events: Event[];
}

function formatDay(date: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(locale, options);
}

/**
 * Billet's programme: every festival day side by side as a running order, instead of
 * one day at a time behind tabs. Carries the same facts per event as `Schedule`.
 */
const BilletProgramme = ({ events }: BilletProgrammeProps) => {
  const locale = getLocale();
  const { data: categories } = useEventCategories();
  const days = useMemo(() => {
    const dates = [...new Set(events.map((event) => event.date))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return dates.map((date) => ({
      date,
      events: events
        .filter((event) => event.date === date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
  }, [events]);

  if (days.length === 0) {
    return <p className="mb-0 text-center">{m.schedule_no_events()}</p>;
  }

  return (
    <div className="billet-programme">
      {days.map((day) => (
        <section key={day.date} className="billet-day" aria-labelledby={`billet-day-${day.date}`}>
          <h3 id={`billet-day-${day.date}`} className="billet-day__head">
            <span className="billet-day__name">
              {formatDay(day.date, locale, { weekday: "long" })}
            </span>
            <span className="billet-day__date">
              {formatDay(day.date, locale, { day: "numeric", month: "short" })}
            </span>
          </h3>
          <ol className="billet-day__list">
            {day.events.map((event) => {
              const label = categoryLabel(categories, event.category, locale);
              return (
                <li key={event.id} className="billet-event">
                  <div className="billet-event__time">
                    {event.endTime ? (
                      <>
                        <span aria-hidden="true">{event.startTime}</span>
                        <span aria-hidden="true" className="billet-event__end">
                          {event.endTime}
                        </span>
                        <span className="sr-only">
                          {m.schedule_time_range({ start: event.startTime, end: event.endTime })}
                        </span>
                      </>
                    ) : (
                      <span>{event.startTime}</span>
                    )}
                  </div>
                  <div className="billet-event__body">
                    <h4 className="billet-event__title">{eventTitle(event, locale)}</h4>
                    <div className="billet-event__tags">
                      {label && <Badge variant="secondary">{label}</Badge>}
                      {event.volunteersOnly && (
                        <Badge variant="info">{m.event_volunteers_only()}</Badge>
                      )}
                      {event.membersOnly && <Badge variant="info">{m.event_members_only()}</Badge>}
                      {event.registrationRequired ? (
                        <Badge variant="warning">{m.schedule_registration()}</Badge>
                      ) : (
                        event.products.length > 0 && (
                          <Badge variant="info">{m.schedule_order_available()}</Badge>
                        )
                      )}
                    </div>
                    <p className="billet-event__text">{eventDescription(event, locale)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
};

export default BilletProgramme;
