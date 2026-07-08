import React from "react";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { getFestivalDateRange, useActiveEdition } from "@/hooks/useActiveEdition";
import { baseUrl } from "@/config/site";

/**
 * Renders JSON-LD structured data for the active festival edition. Renders nothing
 * when there's no active/upcoming edition, so it never advertises a fake event.
 */
const EventStructuredData: React.FC = () => {
  const { edition, hasEdition } = useActiveEdition();

  if (!hasEdition) {
    return null;
  }

  const { start: festivalDate, end: festivalEndDate } = getFestivalDateRange(edition);
  const festivalName = m.festival_name();
  const { venueName, address, city, postalCode, country, coordinates } = edition.venue;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `${festivalName} ${edition.year}`,
    startDate: festivalDate.toISOString(),
    endDate: festivalEndDate.toISOString(),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: venueName,
      address: {
        "@type": "PostalAddress",
        streetAddress: address,
        addressLocality: city,
        postalCode: postalCode,
        addressCountry: country,
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: coordinates.lat,
        longitude: coordinates.lng,
      },
    },
    image: [`${baseUrl}/images/og-image.jpg`],
    description: m.welcome_subtitle(),
    offers: {
      "@type": "Offer",
      url: baseUrl,
      availability: "https://schema.org/InStock",
      priceCurrency: "EUR",
    },
    inLanguage: getLocale(),
    organizer: {
      "@type": "Organization",
      name: festivalName,
      url: baseUrl,
    },
  };

  // Use React.createElement instead of JSX to avoid potential issues with SSR
  // SECURITY NOTE: dangerouslySetInnerHTML is used here to render JSON-LD.
  // This is considered safe because the 'structuredData' object is constructed
  // entirely from trusted, developer-controlled sources (config files, translations)
  // and does not include any raw user input. Ensure this remains true if modifying
  // the data sources in the future.
  return React.createElement("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(structuredData),
    },
  });
};

export default EventStructuredData;
