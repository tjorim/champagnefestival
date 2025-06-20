import React from "react";
import { contactConfig } from "../config/contact";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for default markers not showing in Vite/Webpack builds
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
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
    coordinates = contactConfig.location.coordinates
}) => {
    const { t } = useTranslation();
    const lat = coordinates.lat;
    const lng = coordinates.lng;
    const computedAddress = address;
    const computedLocation = location;

    return (
        <div
            className="ratio ratio-16x9 rounded overflow-hidden border position-relative"
            aria-label={t('location.mapLabel', 'Festival location map')}
        >
            <MapContainer
                center={[lat, lng]}
                zoom={16}
                scrollWheelZoom={false}
                style={{ width: '100%', height: '100%' }}
                aria-label={t('location.mapTitle', 'Interactive map showing venue location')}
                aria-describedby="map-description"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[lat, lng]}>
                    <Popup>
                        <b>{computedLocation}</b><br />
                        {computedAddress}<br />
                        {contactConfig.location.postalCode} {contactConfig.location.city}<br />
                        {t('location.country', contactConfig.location.country)}<br />
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                `${computedLocation}, ${computedAddress}, ${contactConfig.location.postalCode} ${contactConfig.location.city}`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-block', textDecoration: 'none', marginTop: 8 }}
                        >
                            {t('location.openInMaps', 'Open in Maps')}
                        </a>
                    </Popup>
                </Marker>
            </MapContainer>
            <div id="map-description" className="visually-hidden">
                {computedLocation}: {computedAddress}
            </div>
        </div>
    );
};

export default MapComponent;
