/**
 * Builds a Google Maps search URL for a venue, or null when there is nothing to search for.
 */
export function generateGoogleMapsUrl(
  location: string,
  address: string,
  postalCode: string,
  city: string,
  country: string,
): string | null {
  const locationParts = [location, address, postalCode, city, country].filter(Boolean);

  if (locationParts.length === 0) {
    return null;
  }

  const query = locationParts.join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
