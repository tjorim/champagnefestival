'use client';

import React, { useState } from 'react';
import { Tab, Nav, Card, Badge } from 'react-bootstrap';
import { festivalDays, scheduleEvents, ScheduleEvent } from '@/app/config/schedule';
import { useTranslations } from 'next-intl';

const Schedule: React.FC = () => {
  const t = useTranslations('schedule');
  const [activeDay, setActiveDay] = useState(festivalDays[0].id);

  // Get events for the active day
  const dayEvents = scheduleEvents.filter(event => event.dayId === activeDay);
  
  // Sort events by start time
  const sortedEvents = [...dayEvents].sort((a, b) => 
    a.startTime.localeCompare(b.startTime)
  );

  // Get category badge color
  const getCategoryColor = (category: ScheduleEvent['category']) => {
    switch(category) {
      case 'tasting': return 'danger';
      case 'vip': return 'warning';
      case 'party': return 'info';
      case 'breakfast': return 'success';
      case 'exchange': return 'secondary';
      case 'general': return 'primary';
      default: return 'secondary';
    }
  };

  // Get translated day name from dictionary
  const getDayName = (dayLabel: string) => {
    switch(dayLabel.toLowerCase()) {
      case 'friday': return t('days.friday');
      case 'saturday': return t('days.saturday');
      case 'sunday': return t('days.sunday');
      default: return dayLabel;
    }
  };

  // Get translated category name
  const getCategoryLabel = (category: ScheduleEvent['category']) => {
    return t(`categories.${category}`);
  };

  return (
    <div className="schedule-container">
      <Tab.Container 
        activeKey={activeDay} 
        onSelect={(k) => setActiveDay(Number(k))}
      >
        <Nav variant="tabs" className="mb-4 justify-content-center">
          {festivalDays.map(day => (
            <Nav.Item key={day.id}>
              <Nav.Link eventKey={day.id} className="px-4">
                {getDayName(day.label)}
                <span className="d-block small">
                  {new Date(day.date).toLocaleDateString(undefined, { 
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
                          {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                        </div>
                        <div className="flex-grow-1">
                          <h5 className="event-title mb-1">
                            {t(`events.${event.id}.title`, { fallback: event.title })}
                          </h5>
                          <Badge bg={getCategoryColor(event.category)} className="mb-2">
                            {getCategoryLabel(event.category)}
                          </Badge>
                          {event.reservation && (
                            <Badge bg="warning" className="mb-2 ms-2">
                              {t('reservation')}
                            </Badge>
                          )}
                          <p className="event-description mb-1">
                            {t(`events.${event.id}.description`, { fallback: event.description })}
                          </p>
                          {event.presenter && (
                            <p className="event-presenter small mb-0">
                              <strong>{t('presenter')}:</strong> {event.presenter}
                            </p>
                          )}
                          {event.location && (
                            <p className="event-location small mb-0">
                              <strong>{t('location')}:</strong> {event.location}
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
                <p>{t('noEvents')}</p>
              </div>
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
};

export default Schedule;