'use client';

import React from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import { useTranslations } from 'next-intl';
import { contactConfig } from '@/app/config/contact';

/**
 * Component to display venue location information from configuration
 */
const LocationInfo: React.FC = () => {
  const t = useTranslations('location');
  
  return (
    <Card className="border-0 shadow-sm">
      <Card.Body className="p-4">
        <h3 className="mb-3">{contactConfig.location.venueName}</h3>
        <Row>
          <Col md={6} className="mb-3 mb-md-0">
            <div className="mb-4">
              <h5>{t('address')}</h5>
              <p className="mb-1">{contactConfig.location.address}</p>
              <p className="mb-1">{contactConfig.location.postalCode} {contactConfig.location.city}</p>
              <p>{contactConfig.location.country}</p>
            </div>
          </Col>
          <Col md={6}>
            <div>
              <h5>{t('openingHours')}</h5>
              <p>{t('openingHoursValue')}</p>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default LocationInfo;