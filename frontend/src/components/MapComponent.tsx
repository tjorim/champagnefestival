import React, { useId } from "react";
import { contactConfig } from "@/config/contact";
import { m } from "@/paraglide/messages";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { generateGoogleMapsUrl } from "@/utils/maps";

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
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        <p className="text-subtle">{m.error_loading_map()}</p>
      </div>
    );
  }

  // Generate Google Maps URL
  const mapsUrl = generateGoogleMapsUrl(location, address, postalCode, city, country);

  return (
    <div
      className="relative aspect-video overflow-hidden rounded-md border border-border"
      aria-label={m.location_map_label()}
    >
      <MapContainer
        center={[coordinates.lat, coordinates.lng]}
        zoom={16}
        scrollWheelZoom={false}
        className="absolute inset-0 size-full"
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
                className="mt-2 inline-block no-underline"
              >
                {m.location_open_in_maps()}
              </a>
            )}
          </Popup>
        </Marker>
      </MapContainer>
      <div id={descriptionId} className="sr-only">
        {location}: {[address, postalCode, city, country].filter(Boolean).join(", ")}
      </div>
    </div>
  );
};

export default MapComponent;
