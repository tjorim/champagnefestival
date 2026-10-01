import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Event } from "@/types/event";

interface ScheduleProps {
  events: Event[];
}

const Schedule: React.FC<ScheduleProps> = ({ events }) => {
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

  const getCategoryLabel = (category: Event["category"]) => {
    switch (category) {
      case "tasting":
        return m.schedule_categories_tasting();
      case "vip":
        return m.schedule_categories_vip();
      case "party":
        return m.schedule_categories_party();
      case "breakfast":
        return m.schedule_categories_breakfast();
      case "exchange":
        return m.schedule_categories_exchange();
      case "general":
        return m.schedule_categories_general();
      default:
        return category;
    }
  };

  if (days.length === 0) {
    return <p className="tw:mb-0 tw:text-center">{m.schedule_no_events()}</p>;
  }

  return (
    <div className="schedule-container">
      <Tabs value={activeDay} onValueChange={(value) => setActiveDay(Number(value))}>
        <TabsList className="schedule-tabs tw:mb-4 tw:justify-center">
          {days.map((day) => (
            <div key={day.id}>
              <TabsTrigger value={day.id}>
                {getDayName(day.date)}
                <span className="tw:block tw:text-sm">
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
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <TabsContent key={day.id} value={day.id}>
              {sortedEvents.length > 0 ? (
                <div className="events-list">
                  {sortedEvents.map((event) => {
                    return (
                      <Card key={event.id} className="event-card tw:mb-4 tw:border-0">
                        <CardContent>
                          <div className="tw:flex tw:justify-between tw:items-start tw:gap-4">
                            <div className="event-time tw:me-4 tw:whitespace-nowrap">
                              {event.endTime ? (
                                <>
                                  <div title={m.schedule_start_time()}>{event.startTime}</div>
                                  <div title={m.schedule_end_time()}>{event.endTime}</div>
                                  <span className="tw:sr-only">
                                    {m.schedule_time_range({
                                      start: event.startTime,
                                      end: event.endTime,
                                    })}
                                  </span>
                                </>
                              ) : (
                                <span title={m.schedule_time()}>{event.startTime}</span>
                              )}
                            </div>
                            <div className="tw:grow">
                              <h5 className="event-title tw:mb-1">{event.title}</h5>
                              <Badge variant={getCategoryColor(event.category)} className="tw:mb-2">
                                {getCategoryLabel(event.category)}
                              </Badge>
                              {event.registrationRequired ? (
                                <Badge variant="warning" className="tw:mb-2 tw:ms-2">
                                  {m.schedule_registration()}
                                </Badge>
                              ) : (
                                event.products.length > 0 && (
                                  <Badge variant="info" className="tw:mb-2 tw:ms-2">
                                    {m.schedule_order_available()}
                                  </Badge>
                                )
                              )}
                              <p className="event-description tw:mb-1">{event.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="tw:text-center tw:mb-0">{m.schedule_no_events()}</p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

export default Schedule;
