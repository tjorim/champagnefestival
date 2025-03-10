'use client';

import { festivalYear, festivalDate, festivalEndDate } from '@/app/config/dates';
import { contactConfig } from '@/app/config/contact';
import { baseUrl } from '@/app/config/site';
import { useTranslations } from 'next-intl';

interface EventStructuredDataProps {
  locale: string;
}

/**
 * Component that renders JSON-LD structured data for an event
 */
export default function EventStructuredData({ locale }: EventStructuredDataProps) {
  const t = useTranslations();
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
      },
      'geo': {
        '@type': 'GeoCoordinates',
        'latitude': lat,
        'longitude': lng
      }
    },
    'image': [`${baseUrl}/images/og-image.jpg`],
    'description': t('welcome.subtitle', { defaultValue: 'Annual champagne festival featuring tastings, masterclasses, and gourmet food pairings' }),
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

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData)
      }}
    />
  );
}