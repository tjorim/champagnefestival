import React from "react";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { getFestivalDateRange, useActiveEdition } from "@/hooks/useActiveEdition";
import { baseUrl } from "@/config/site";

/** Marks the JSON-LD <script> the backend renders into <head> for GET / (#992,
 * docs/decisions/992-live-public-render.md decision 3) — kept in sync with
 * backend/app/services/public_render.py's json_ld_script. */
const SSR_JSON_LD_SELECTOR = 'script[data-ssr-jsonld="true"]';

/**
 * Renders JSON-LD structured data for the active festival edition. Renders nothing
 * when there's no active/upcoming edition, so it never advertises a fake event —
 * and nothing when the backend already rendered one into <head> on this page
 * load, so a crawler never sees two conflicting Event objects.
 */
const EventStructuredData: React.FC = () => {
  const { edition, hasEdition } = useActiveEdition();

  if (document.querySelector(SSR_JSON_LD_SELECTOR)) {
    return null;
  }

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
