import React, { useState, useRef, useEffect } from "react";
import { Spinner } from "react-bootstrap";
import { contactConfig } from "../config/contact";
import { useTranslation } from "react-i18next";
import type { Map } from "leaflet";

interface MapComponentProps {
    address?: string;
    location?: string;
}

/**
 * Interactive map component using Leaflet
 * 
 * This component renders an interactive map showing the festival location
 * with a marker and popup displaying the venue name and address.
 * 
 * Features:
 * - Dynamic Leaflet loading for better performance
 * - Loading spinner while map is initializing
 * - Error handling for map loading failures
 * - Accessibility support with ARIA attributes
 * - Configurable location with fallbacks to the contact config
 */
const MapComponent: React.FC<MapComponentProps> = ({ 
    address, 
    location = contactConfig.location.venueName
}) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    
    // Get coordinates from contact config
    const lat = contactConfig.location.coordinates.lat;
    const lng = contactConfig.location.coordinates.lng;
    
    // Will hold references to the Leaflet map and marker
    // Using a type import for better type safety
    const mapRef = useRef<Map | null>(null);

    useEffect(() => {
        // Function to initialize the map
        const initializeMap = async () => {
            // Calculate the address and location values inside the effect
            const effectAddress = address || contactConfig.location.address;
            const effectLocation = location || contactConfig.location.venueName;
            
            try {
                // Dynamically import Leaflet at runtime
                const L = await import('leaflet').then(module => module.default);
                
                // No need to dynamically load CSS as we'll import it directly
                
                // Fix missing marker icon issue by manually setting the icon path to the CDN
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const IconDefault = L.Icon.Default as any;
                delete IconDefault.prototype._getIconUrl;
                
                // Directly set the default icon paths to use the CDN
                L.Icon.Default.mergeOptions({
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
                });

                // If map container exists and Leaflet is loaded
                if (mapContainerRef.current && !mapRef.current) {
                    // Create a new map instance with scroll wheel zoom disabled
                    mapRef.current = L.map(mapContainerRef.current, {
                        scrollWheelZoom: false
                    }).setView([lat, lng], 16);
                    
                    // Add OpenStreetMap tile layer
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }).addTo(mapRef.current);
                    
                    // Add a marker for the location using the default icon
                    L.marker([lat, lng]).addTo(mapRef.current)
                        .bindPopup(`<b>${effectLocation}</b><br>${effectAddress}`)
                        .openPopup();
                    
                    // Update loading state
                    setIsLoading(false);
                }
            } catch (error) {
                console.error("Failed to initialize map:", error);
                setIsError(true);
                setIsLoading(false);
            }
        };

        initializeMap();
        
        // Cleanup function to destroy the map when component unmounts
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [lat, lng, address, location]);

    // Compute the address and location name from props or config
    const computedAddress = address || contactConfig.location.address;
    const computedLocation = location || contactConfig.location.venueName;
    
    return (
        <div 
            className="ratio ratio-16x9 rounded overflow-hidden border position-relative"
            aria-label={t('location.mapLabel', 'Festival location map')}
        >
            {isLoading && (
                <div 
                    className="position-absolute top-0 start-0 w-100 h-100 bg-dark d-flex align-items-center justify-content-center"
                    aria-live="polite"
                >
                    <div className="text-center">
                        <Spinner animation="border" variant="light" className="mb-2" aria-hidden="true" />
                        <p className="text-light mb-0">{t('loading', 'Loading...')}</p>
                    </div>
                </div>
            )}

            {isError && (
                <div 
                    className="bg-dark p-4 text-center d-flex align-items-center justify-content-center"
                    aria-live="assertive"
                >
                    <p className="mb-0 text-light">{t('error', 'Failed to load map')}</p>
                </div>
            )}
            
            {/* Map container */}
            <div 
                ref={mapContainerRef} 
                className="map-container w-100 h-100"
                style={{ zIndex: 1 }}
                role="application"
                aria-label={t('location.mapTitle', 'Interactive map showing venue location')}
                aria-describedby="map-description"
            ></div>
            
            {/* Hidden description for screen readers */}
            <div id="map-description" className="visually-hidden">
                {computedLocation}: {computedAddress}
            </div>
        </div>
    );
};

export default MapComponent;
