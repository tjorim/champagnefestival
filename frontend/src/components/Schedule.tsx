import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { EventPublicOut as Event } from "@/api-types";
import { categoryLabel, useEventCategories } from "@/hooks/useCategories";
import { eventDescription, eventTitle } from "@/lib/editions/eventText";

interface ScheduleProps {
  events: Event[];
}

const Schedule: React.FC<ScheduleProps> = ({ events }) => {
  const locale = getLocale();
  const { data: categories } = useEventCategories();
  const days = useMemo(() => {
    return [...new Set(events.map((event) => event.date))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((date, index) => ({ id: index + 1, date }));
  }, [events]);

  const [activeDay, setActiveDay] = useState(days[0]?.id ?? 1);

  const getCategoryColor = (category: Event["category"]) => {
    switch (category) {
      case "tasting":
        return "danger";
      case "vip":
        return "warning";
      case "party":
        return "info";
      case "breakfast":
        return "success";
      case "exchange":
        return "secondary";
      case "general":
        return "primary";
      case "ceremony":
        return "warning";
      case "social":
        return "success";
      default:
        return "secondary";
    }
  };

  const getDayName = (dayDate: string) => {
    try {
      switch (new Date(dayDate + "T00:00:00").getDay()) {
        case 5:
          return m.schedule_days_friday();
        case 6:
          return m.schedule_days_saturday();
        case 0:
          return m.schedule_days_sunday();
        default:
          return new Date(dayDate + "T00:00:00").toLocaleDateString(getLocale(), {
            weekday: "long",
          });
      }
    } catch {
      return dayDate;
    }
  };

  if (days.length === 0) {
    return <p className="mb-0 text-center">{m.schedule_no_events()}</p>;
  }

  return (
    <div>
      <Tabs themed value={activeDay} onValueChange={(value) => setActiveDay(Number(value))}>
        <TabsList className="schedule-tabs mb-4 justify-center">
          {days.map((day) => (
            <div key={day.id}>
              <TabsTrigger value={day.id}>
                {getDayName(day.date)}
                <span className="block text-sm">
                  {(() => {
                    try {
                      return new Date(day.date + "T00:00:00").toLocaleDateString(getLocale(), {
                        month: "short",
                        day: "numeric",
                      });
                    } catch {
                      return day.date;
                    }
                  })()}
                </span>
              </TabsTrigger>
            </div>
          ))}
        </TabsList>

        {days.map((day) => {
          const sortedEvents = events
            .filter((event) => event.date === day.date)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          return (
            <TabsContent key={day.id} value={day.id}>
              {sortedEvents.length > 0 ? (
                <div className="events-list">
                  {sortedEvents.map((event) => {
                    const label = categoryLabel(categories, event.category, locale);
                    return (
                      <Card key={event.id} className="event-card mb-4 border-0">
                        <CardContent>
                          <div className="flex justify-between items-start gap-4">
                            <div className="event-time me-4 whitespace-nowrap">
                              {event.end_time ? (
                                <>
                                  <div title={m.schedule_start_time()}>{event.start_time}</div>
                                  <div title={m.schedule_end_time()}>{event.end_time}</div>
                                  <span className="sr-only">
                                    {m.schedule_time_range({
                                      start: event.start_time,
                                      end: event.end_time,
                                    })}
                                  </span>
                                </>
                              ) : (
                                <span title={m.schedule_time()}>{event.start_time}</span>
                              )}
                            </div>
                            <div className="grow">
                              {/* h5 keeps the themes' card styling; aria-level places it under the section's h2 */}
                              <h5 aria-level={3} className="event-title mb-1">
                                {eventTitle(event, locale)}
                              </h5>
                              {event.volunteers_only && (
                                <Badge variant="info" className="mb-2">
                                  {m.event_volunteers_only()}
                                </Badge>
                              )}
                              {event.members_only && (
                                <Badge variant="info" className="mb-2">
                                  {m.event_members_only()}
                                </Badge>
                              )}
                              {label && (
                                <Badge variant={getCategoryColor(event.category)} className="mb-2">
                                  {label}
                                </Badge>
                              )}
                              {event.registration_required ? (
                                <Badge variant="warning" className="mb-2 ms-2">
                                  {m.schedule_registration()}
                                </Badge>
                              ) : (
                                event.products.length > 0 && (
                                  <Badge variant="info" className="mb-2 ms-2">
                                    {m.schedule_order_available()}
                                  </Badge>
                                )
                              )}
                              <p className="event-description mb-1">
                                {eventDescription(event, locale)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center mb-0">{m.schedule_no_events()}</p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

export default Schedule;
