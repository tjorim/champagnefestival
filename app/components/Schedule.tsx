'use client';

import React, { useState } from 'react';
import { Tab, Nav, Card, Badge } from 'react-bootstrap';
import { festivalDays, scheduleEvents, ScheduleEvent } from '@/app/config/schedule';
import { Dictionary } from '@/lib/i18n';

interface ScheduleProps {
  dictionary: Dictionary;
}

const Schedule: React.FC<ScheduleProps> = ({ dictionary }) => {
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

  // Get category label from dictionary
  const getCategoryLabel = (category: ScheduleEvent['category']) => {
    switch(category) {
      case 'tasting': return dictionary.schedule.categories.tasting;
      case 'vip': return dictionary.schedule.categories.vip;
      case 'party': return dictionary.schedule.categories.party;
      case 'breakfast': return dictionary.schedule.categories.breakfast;
      case 'exchange': return dictionary.schedule.categories.exchange;
      case 'general': return dictionary.schedule.categories.general;
      default: return category;
    }
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
                {dictionary.schedule.days[day.label.toLowerCase() as keyof typeof dictionary.schedule.days]}
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
                            {dictionary.schedule.events?.[event.id]?.title || event.title}
                          </h5>
                          <Badge bg={getCategoryColor(event.category)} className="mb-2">
                            {getCategoryLabel(event.category)}
                          </Badge>
                          {event.reservation && (
                            <Badge bg="warning" className="mb-2 ms-2">
                              {dictionary.schedule.reservation}
                            </Badge>
                          )}
                          <p className="event-description mb-1">
                            {dictionary.schedule.events?.[event.id]?.description || event.description}
                          </p>
                          {event.presenter && (
                            <p className="event-presenter small mb-0">
                              <strong>{dictionary.schedule.presenter}:</strong> {event.presenter}
                            </p>
                          )}
                          {event.location && (
                            <p className="event-location small mb-0">
                              <strong>{dictionary.schedule.location}:</strong> {event.location}
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
                <p>{dictionary.schedule.noEvents}</p>
              </div>
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
};

export default Schedule;