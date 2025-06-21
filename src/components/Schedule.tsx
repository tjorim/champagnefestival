import React, { useState, useMemo } from 'react';
import { Tab, Nav, Card, Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { festivalDays, scheduleEvents, ScheduleEvent } from '../config/schedule';

/**
 * Schedule component displays the festival schedule with tabs for each festival day 
 * and a list of events with times, descriptions, and category badges.
 * 
 * Features:
 * - Day-based tabs for navigating between festival days
 * - Sorted event listings by time
 * - Color-coded category badges
 * - Support for event details: location, presenter, reservation requirements
 */
const Schedule: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [activeDay, setActiveDay] = useState(festivalDays[0].id);

  // Get events for the active day and sort them by start time
  const sortedEvents = useMemo(() => {
    const dayEvents = scheduleEvents.filter(event => event.dayId === activeDay);
    return [...dayEvents].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
  }, [activeDay]); // Recompute only when activeDay changes

  // Get category badge color
  const getCategoryColor = (category: ScheduleEvent['category']) => {
    switch (category) {
      case 'tasting': return 'danger';
      case 'vip': return 'warning';
      case 'party': return 'info';
      case 'breakfast': return 'success';
      case 'exchange': return 'secondary';
      case 'general': return 'primary';
      default: return 'secondary';
    }
  };

  // Get translated day name
  const getDayName = (dayLabel: string) => {
    switch (dayLabel.toLowerCase()) {
      case 'friday': return t('schedule.days.friday', 'Friday');
      case 'saturday': return t('schedule.days.saturday', 'Saturday');
      case 'sunday': return t('schedule.days.sunday', 'Sunday');
      default: return dayLabel;
    }
  };

  // Get translated category name
  const getCategoryLabel = (category: ScheduleEvent['category']) => {
    return t(`schedule.categories.${category}`, category);
  };

  return (
    <div className="schedule-container">
      <Tab.Container
        activeKey={activeDay}
        onSelect={(k) => k && setActiveDay(Number(k))}
      >
        <Nav variant="tabs" className="mb-4 justify-content-center">
          {festivalDays.map(day => (
            <Nav.Item key={day.id}>
              <Nav.Link eventKey={day.id} className="px-4">
                {getDayName(day.label)}
                <span className="d-block small">
                  {new Date(day.date).toLocaleDateString(i18n.language, {
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey={activeDay} active={true}>
            {sortedEvents.length > 0 ? (
              <div className="events-list">
                {sortedEvents.map(event => (
                  <Card key={event.id} className="mb-3 shadow-sm border-0">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="event-time text-muted me-3 text-nowrap">
                          {event.endTime ? (
                            <>
                              <div title={t('schedule.startTime', 'Start time')}>{event.startTime}</div>
                              <div title={t('schedule.endTime', 'End time')}>{event.endTime}</div>
                              <span className="visually-hidden">
                                {t('schedule.timeRange', 'From {{start}} to {{end}}', {
                                  start: event.startTime,
                                  end: event.endTime
                                })}
                              </span>
                            </>
                          ) : (
                            <span title={t('schedule.time', 'Time')}>{event.startTime}</span>
                          )}
                        </div>
                        <div className="flex-grow-1">
                          <h5 className="event-title mb-1">
                            {t(`schedule.events.${event.id}.title`, event.title)}
                          </h5>
                          <Badge bg={getCategoryColor(event.category)} className="mb-2">
                            {getCategoryLabel(event.category)}
                          </Badge>
                          {event.reservation && (
                            <Badge bg="warning" className="mb-2 ms-2">
                              {t('schedule.reservation', 'Reservation required')}
                            </Badge>
                          )}
                          <p className="event-description mb-1">
                            {t(`schedule.events.${event.id}.description`, event.description)}
                          </p>
                          {event.presenter && (
                            <p className="event-presenter small mb-0">
                              <strong>{t('schedule.presenter', 'Presenter')}:</strong> {event.presenter}
                            </p>
                          )}
                          {event.location && (
                            <p className="event-location small mb-0">
                              <strong>{t('schedule.location', 'Location')}:</strong> {event.location}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-5">
                <p>{t('schedule.noEvents', 'No events scheduled for this day')}</p>
              </div>
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
};

export default Schedule;