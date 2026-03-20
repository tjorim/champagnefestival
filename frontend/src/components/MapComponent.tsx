import React from "react";
import { contactConfig } from "@/config/contact";
import { m } from "@/paraglide/messages";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

/**
 * Generates a Google Maps URL for the given location data
 * @param location - Venue name
 * @param address - Street address
 * @param postalCode - Postal code
 * @param city - City name
 * @returns Google Maps search URL or null if no valid location data
 */
const generateGoogleMapsUrl = (
  location: string,
  address: string,
  postalCode: string,
  city: string,
): string | null => {
  const locationParts = [location, address, postalCode, city].filter(Boolean);

  if (locationParts.length === 0) {
    return null;
  }

  const query = locationParts.join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

// Fix for default markers not showing in Vite/Webpack builds
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface MapComponentProps {
  address?: string;
  location?: string;
  coordinates?: { lat: number; lng: number };
}

/**
 * Interactive map component using react-leaflet
 *
 * This component renders an interactive map showing the festival location
 * with a marker and popup displaying the venue name and address.
 *
 * Features:
 * - React-leaflet integration for better React compatibility
 * - Accessibility support with ARIA attributes
 * - Configurable location with fallbacks to the contact config
 */
const MapComponent: React.FC<MapComponentProps> = ({
  address = contactConfig.location.address,
  location = contactConfig.location.venueName,
  coordinates = contactConfig.location.coordinates,
}) => {
  // Validate coordinates
  const validCoordinates =
    coordinates &&
    typeof coordinates.lat === "number" &&
    typeof coordinates.lng === "number" &&
    !isNaN(coordinates.lat) &&
    !isNaN(coordinates.lng) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180;

  if (!validCoordinates) {
    return (
      <div className="ratio ratio-16x9 rounded overflow-hidden border d-flex align-items-center justify-content-center bg-light">
        <p className="text-muted">{m.error_loading_map()}</p>
      </div>
    );
  }

  // Generate Google Maps URL
  const mapsUrl = generateGoogleMapsUrl(
    location,
    address,
    contactConfig.location.postalCode,
    contactConfig.location.city,
  );

  return (
    <div
      className="ratio ratio-16x9 rounded overflow-hidden border position-relative"
      aria-label={m.location_map_label()}
    >
      <MapContainer
        center={[coordinates.lat, coordinates.lng]}
        zoom={16}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "100%" }}
        aria-label={m.location_map_title()}
        aria-describedby="map-description"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[coordinates.lat, coordinates.lng]}>
          <Popup>
            <b>{location}</b>
            <br />
            {address}
            <br />
            {contactConfig.location.postalCode} {contactConfig.location.city}
            <br />
            {m.location_country()}
            <br />
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", textDecoration: "none", marginTop: 8 }}
              >
                {m.location_open_in_maps()}
              </a>
            )}
          </Popup>
        </Marker>
      </MapContainer>
      <div id="map-description" className="visually-hidden">
        {location}: {address}
      </div>
    </div>
  );
};

export default MapComponent;
