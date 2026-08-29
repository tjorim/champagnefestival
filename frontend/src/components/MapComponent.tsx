import React, { useId } from "react";
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
  country: string,
): string | null => {
  const locationParts = [location, address, postalCode, city, country].filter(Boolean);

  if (locationParts.length === 0) {
    return null;
  }

  const query = locationParts.join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

// A dedicated icon avoids Leaflet prepending its auto-detected image path to
// the asset URLs emitted by Vite.
const venueMarkerIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapComponentProps {
  address?: string;
  city?: string;
  country?: string;
  location?: string;
  postalCode?: string;
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
  city = contactConfig.location.city,
  country = contactConfig.location.country,
  location = contactConfig.location.venueName,
  postalCode = contactConfig.location.postalCode,
  coordinates = contactConfig.location.coordinates,
}) => {
  const descriptionId = useId();

  // Validate coordinates
  const validCoordinates =
    coordinates &&
    typeof coordinates.lat === "number" &&
    typeof coordinates.lng === "number" &&
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng) &&
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
  const mapsUrl = generateGoogleMapsUrl(location, address, postalCode, city, country);

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
        aria-describedby={descriptionId}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[coordinates.lat, coordinates.lng]} icon={venueMarkerIcon}>
          <Popup>
            <b>{location}</b>
            <br />
            {address}
            <br />
            {[postalCode, city].filter(Boolean).join(" ")}
            <br />
            {country}
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
      <div id={descriptionId} className="visually-hidden">
        {location}: {[address, postalCode, city, country].filter(Boolean).join(", ")}
      </div>
    </div>
  );
};

export default MapComponent;
