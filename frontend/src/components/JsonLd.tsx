import React from "react";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { getFestivalDateRange, useActiveEdition } from "@/hooks/useActiveEdition";
import { baseUrl } from "@/config/site";
import type { Event } from "@/types/event";
import { eventDescription, eventTitle } from "@/utils/eventText";

/** Marks the JSON-LD <script> the backend renders into <head> for GET /.
 * Kept in sync with
 * backend/app/services/public_render.py's json_ld_script. */
const SSR_JSON_LD_SELECTOR = 'script[data-ssr-jsonld="true"]';

/** Local date + "HH:MM" as an instant, like the backend's Europe/Brussels one in the contract test. */
function localInstant(date: string, clock: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

/** The edition's events as schema.org `subEvent` entries, titled in the visitor's language. */
function subEvents(events: Event[], locale: string) {
  return events.map((event) => {
    const description = eventDescription(event, locale);
    return {
      "@type": "Event",
      name: eventTitle(event, locale),
      startDate: localInstant(event.date, event.startTime),
      ...(event.endTime ? { endDate: localInstant(event.date, event.endTime) } : {}),
      ...(description ? { description } : {}),
    };
  });
}

/**
 * Renders JSON-LD structured data for the active festival edition. Renders nothing
 * when there's no active/upcoming edition, so it never advertises a fake event —
 * and nothing when the backend already rendered one into <head> on this page
 * load, so a crawler never sees two conflicting Event objects.
 *
 * Known limitation, accepted deliberately: the SSR marker is checked once
 * per mount and never cleared, so a visitor who navigates away from `/` and
 * back via client-side routing (no full page load) keeps seeing the
 * original server-rendered JSON-LD even if the edition data has since
 * changed. This is invisible metadata with no effect on what a visitor
 * actually sees, and crawlers — the audience this data is for — always
 * fetch `/` fresh rather than navigating client-side, so they never hit
 * this path. Revisit only if that stops being true.
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
    ...(edition.events.length > 0 ? { subEvent: subEvents(edition.events, getLocale()) } : {}),
  };

  // Use React.createElement instead of JSX to avoid potential issues with SSR
  // SECURITY NOTE: dangerouslySetInnerHTML is used here to render JSON-LD. The
  // object holds translations and admin-authored event text, so "<" is escaped
  // in the serialized JSON (as the backend does) and a "</script>" in a title
  // cannot end the element. Keep escaping if the data sources change.
  return React.createElement("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
    },
  });
};

export default EventStructuredData;
