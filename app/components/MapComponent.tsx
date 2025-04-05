'use client';

import { useState, useRef, useEffect } from "react";
import { Spinner } from "react-bootstrap";
import { contactConfig } from "@/app/config/contact";
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

interface MapComponentProps {
    address?: string;
    location?: string;
}

// Dynamic import for Leaflet components to prevent SSR issues
// This is necessary because Leaflet relies on browser APIs not available during server-side rendering
const MapComponentClient = ({ 
    address, 
    location = contactConfig.location.venueName
}: MapComponentProps) => {
    const t = useTranslations();
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    
    // Get address - will be overridden with computed value later
    
    // Get coordinates from contact config
    const lat = contactConfig.location.coordinates.lat;
    const lng = contactConfig.location.coordinates.lng;
    
    // Will hold references to the Leaflet map and marker
    // Using proper Leaflet types
    const mapRef = useRef<import('leaflet').Map | null>(null);
    const loadingText = t('loading');
    const errorText = t('error');

    useEffect(() => {
        // Function to initialize the map
        const initializeMap = async () => {
            // Calculate the address and location values inside the effect
            const effectAddress = address || contactConfig.location.address;
            const effectLocation = location || contactConfig.location.venueName;
            
            try {
                // Dynamically import Leaflet at runtime to avoid SSR issues
                const L = (await import('leaflet')).default;
                
                // Import Leaflet CSS needed for proper styling
                // This is a workaround for Next.js - usually you'd import the CSS in the component itself
                const leafletCss = document.createElement('link');
                leafletCss.rel = 'stylesheet';
                leafletCss.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                leafletCss.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
                leafletCss.crossOrigin = '';
                document.head.appendChild(leafletCss);
                
                // Fix missing marker icon issue by manually setting the icon path
                // This is needed because the default icon paths are broken in bundled environments
                // Using a type assertion to avoid TypeScript errors with _getIconUrl
                // Define an extended interface for L.Icon.Default that includes _getIconUrl method
                // Cast to unknown first to avoid TypeScript errors with the internal _getIconUrl property
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const IconDefault = L.Icon.Default as any;
                delete IconDefault.prototype._getIconUrl;
                
                L.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
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
                    
                    // Add a marker for the location using the effect-scoped variables
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
    }, [lat, lng, address, location, loadingText, errorText]);

    // Compute the address and location name from props or config
    const computedAddress = address || contactConfig.location.address;
    const computedLocation = location || contactConfig.location.venueName;
    
    return (
        <div 
            className="ratio ratio-16x9 rounded overflow-hidden border position-relative"
            aria-label={t('location.mapLabel', { defaultValue: 'Festival location map' })}
        >
            {isLoading && (
                <div 
                    className="position-absolute top-0 start-0 w-100 h-100 bg-dark d-flex align-items-center justify-content-center"
                    aria-live="polite"
                >
                    <div className="text-center">
                        <Spinner animation="border" variant="light" className="mb-2" aria-hidden="true" />
                        <p className="text-light mb-0">{loadingText}</p>
                    </div>
                </div>
            )}

            {isError && (
                <div 
                    className="bg-dark p-4 text-center d-flex align-items-center justify-content-center"
                    aria-live="assertive"
                >
                    <p className="mb-0 text-light">{errorText}</p>
                </div>
            )}
            
            {/* Map container */}
            <div 
                ref={mapContainerRef} 
                className="map-container w-100 h-100"
                style={{ zIndex: 1 }}
                role="application"
                aria-label={t('location.mapTitle', { defaultValue: 'Interactive map showing venue location' })}
                aria-describedby="map-description"
            ></div>
            
            {/* Hidden description for screen readers */}
            <div id="map-description" className="visually-hidden">
                {computedLocation}: {computedAddress}
            </div>
        </div>
    );
};

// Use dynamic import with ssr: false to prevent server-side rendering
const MapComponent = dynamic(() => Promise.resolve(MapComponentClient), {
    ssr: false,
    loading: () => {
        // We need to wrap this in a client component that has access to useTranslations
        const LoadingComponent = () => {
            const t = useTranslations();
            return (
                <div className="ratio ratio-16x9 rounded overflow-hidden border bg-dark d-flex align-items-center justify-content-center">
                    <div className="text-center">
                        <Spinner animation="border" variant="light" className="mb-2" />
                        <p className="text-light mb-0">{t('loading')}</p>
                    </div>
                </div>
            );
        };
        return <LoadingComponent />;
    }
});

export default MapComponent;