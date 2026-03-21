import React, { useState, useMemo } from "react";
import { Tab, Nav, Card, Badge } from "react-bootstrap";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Event } from "@/config/editions";
import type { FestivalDay } from "@/types/schedule";

interface ScheduleProps {
  days: FestivalDay[];
  events: Event[];
}

/**
 * Schedule component displays the festival schedule with tabs for each festival day
 * and a list of events with times, descriptions, and category badges.
 */
const Schedule: React.FC<ScheduleProps> = ({ days, events }) => {
  const [activeDay, setActiveDay] = useState(days[0]?.id ?? 1);

  // Get events for the active day and sort them by start time
  const sortedEvents = useMemo(() => {
    const dayEvents = events.filter((event) => event.dayId === activeDay);
    return [...dayEvents].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activeDay, events]);

  // Get category badge color
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

  // Get translated day name
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

  // Get translated category name
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

  return (
    <div className="schedule-container">
      <Tab.Container activeKey={activeDay} onSelect={(k) => k && setActiveDay(Number(k))}>
        <Nav variant="tabs" className="mb-4 justify-content-center">
          {days.map((day) => (
            <Nav.Item key={day.id}>
              <Nav.Link eventKey={day.id} className="px-4">
                {getDayName(day.date)}
                <span className="d-block small">
                  {(() => {
                    try {
                      return new Date(day.date + "T00:00:00").toLocaleDateString(getLocale(), {
                        month: "short",
                        day: "numeric",
                      });
                    } catch (error) {
                      console.warn("Date formatting error for day:", day.date, error);
                      return day.date || "";
                    }
                  })()}
                </span>
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey={activeDay} active={true}>
            {sortedEvents.length > 0 ? (
              <div className="events-list">
                {sortedEvents.map((event) => (
                  <Card key={event.id} className="mb-3 shadow-sm border-0">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="event-time text-muted me-3 text-nowrap">
                          {event.endTime ? (
                            <>
                              <div title={m.schedule_start_time()}>{event.startTime}</div>
                              <div title={m.schedule_end_time()}>{event.endTime}</div>
                              <span className="visually-hidden">
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
                        <div className="flex-grow-1">
                          <h5 className="event-title mb-1">{event.title}</h5>
                          <Badge bg={getCategoryColor(event.category)} className="mb-2">
                            {getCategoryLabel(event.category)}
                          </Badge>
                          {event.reservation && (
                            <Badge bg="warning" className="mb-2 ms-2">
                              {m.schedule_reservation()}
                            </Badge>
                          )}
                          <p className="event-description mb-1">{event.description}</p>
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-5">
                <p>{m.schedule_no_events()}</p>
              </div>
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
};

export default Schedule;
