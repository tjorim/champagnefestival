import React from 'react';
import { useTranslation } from 'react-i18next';
import { festivalYear, festivalDate, festivalEndDate } from '../config/dates';
import { contactConfig } from '../config/contact';
import { baseUrl } from '../config/site';

interface EventStructuredDataProps {
  locale: string;
}

/**
 * Component that renders JSON-LD structured data for an event
 * Uses react-i18next for translations and our configuration files
 */
const EventStructuredData: React.FC<EventStructuredDataProps> = ({ locale }) => {
  const { t } = useTranslation();
  const festivalName = t('festivalName', { defaultValue: 'Champagne Festival' });
  
  const venueAddress = contactConfig.location.address;
  const venueName = contactConfig.location.venueName;
  const { lat, lng } = contactConfig.location.coordinates;
  
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': `${festivalName} ${festivalYear}`,
    'startDate': festivalDate.toISOString(),
    'endDate': festivalEndDate.toISOString(),
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'eventStatus': 'https://schema.org/EventScheduled',
    'location': {
      '@type': 'Place',
      'name': venueName,
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': venueAddress,
        'addressLocality': contactConfig.location.city,
        'postalCode': contactConfig.location.postalCode,
        'addressCountry': contactConfig.location.country
      },
      'geo': {
        '@type': 'GeoCoordinates',
        'latitude': lat,
        'longitude': lng
      }
    },
    'image': [`${baseUrl}/images/og-image.jpg`],
    'description': t('welcome.subtitle', { 
      defaultValue: 'Annual champagne festival featuring tastings, masterclasses, and gourmet food pairings' 
    }),
    'offers': {
      '@type': 'Offer',
      'url': `${baseUrl}/${locale}`,
      'availability': 'https://schema.org/InStock',
      'priceCurrency': 'EUR'
    },
    'organizer': {
      '@type': 'Organization',
      'name': festivalName,
      'url': baseUrl
    }
  };

  // Use React.createElement instead of JSX to avoid potential issues with SSR
  return React.createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(structuredData)
    }
  });
};

export default EventStructuredData;