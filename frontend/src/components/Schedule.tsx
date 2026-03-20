import React, { useState, useMemo } from "react";
import { Tab, Nav, Card, Badge } from "react-bootstrap";
import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";
import type { FestivalDay, ScheduleEvent } from "../config/schedule";

/**
 * Returns the translated title and description for a schedule event ID.
 * Falls back to the event's own title/description if no translation is found.
 */
function getEventTranslation(
  eventId: string,
  fallbackTitle: string,
  fallbackDesc: string,
): { title: string; description: string } {
  switch (eventId) {
    case "fri-tasting":
      return {
        title: m.schedule_events_fri_tasting_title(),
        description: m.schedule_events_fri_tasting_description(),
      };
    case "fri-vip":
      return {
        title: m.schedule_events_fri_vip_title(),
        description: m.schedule_events_fri_vip_description(),
      };
    case "fri-end":
      return {
        title: m.schedule_events_fri_end_title(),
        description: m.schedule_events_fri_end_description(),
      };
    case "sat-exchange":
      return {
        title: m.schedule_events_sat_exchange_title(),
        description: m.schedule_events_sat_exchange_description(),
      };
    case "sat-opening":
      return {
        title: m.schedule_events_sat_opening_title(),
        description: m.schedule_events_sat_opening_description(),
      };
    case "sat-party":
      return {
        title: m.schedule_events_sat_party_title(),
        description: m.schedule_events_sat_party_description(),
      };
    case "sat-end":
      return {
        title: m.schedule_events_sat_end_title(),
        description: m.schedule_events_sat_end_description(),
      };
    case "sun-breakfast":
      return {
        title: m.schedule_events_sun_breakfast_title(),
        description: m.schedule_events_sun_breakfast_description(),
      };
    case "sun-opening":
      return {
        title: m.schedule_events_sun_opening_title(),
        description: m.schedule_events_sun_opening_description(),
      };
    case "sun-end":
      return {
        title: m.schedule_events_sun_end_title(),
        description: m.schedule_events_sun_end_description(),
      };
    default:
      return { title: fallbackTitle, description: fallbackDesc };
  }
}

interface ScheduleProps {
  days: FestivalDay[];
  events: ScheduleEvent[];
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
  const getCategoryColor = (category: ScheduleEvent["category"]) => {
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
  const getDayName = (dayId: string | number, dayLabel: string) => {
    switch (String(dayId).toLowerCase()) {
      case "1":
      case "friday":
        return m.schedule_days_friday();
      case "2":
      case "saturday":
        return m.schedule_days_saturday();
      case "3":
      case "sunday":
        return m.schedule_days_sunday();
      default:
        return dayLabel;
    }
  };

  // Get translated category name
  const getCategoryLabel = (category: ScheduleEvent["category"]) => {
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
                {getDayName(day.id, day.label)}
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
                {sortedEvents.map((event) => {
                  const { title, description } = getEventTranslation(
                    event.id,
                    event.title,
                    event.description,
                  );
                  return (
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
                            <h5 className="event-title mb-1">{title}</h5>
                            <Badge bg={getCategoryColor(event.category)} className="mb-2">
                              {getCategoryLabel(event.category)}
                            </Badge>
                            {event.reservation && (
                              <Badge bg="warning" className="mb-2 ms-2">
                                {m.schedule_reservation()}
                              </Badge>
                            )}
                            <p className="event-description mb-1">{description}</p>
                            {event.presenter && (
                              <p className="event-presenter small mb-0">
                                <strong>{m.schedule_presenter()}:</strong> {event.presenter}
                              </p>
                            )}
                            {event.location && (
                              <p className="event-location small mb-0">
                                <strong>{m.schedule_location()}:</strong> {event.location}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  );
                })}
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
