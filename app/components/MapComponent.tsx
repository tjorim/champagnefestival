'use client';

import { useState, useRef, useEffect } from "react";
import { Spinner } from "react-bootstrap";
import { contactConfig } from "@/app/config/contact";
import dynamic from 'next/dynamic';
import { Dictionary } from "@/lib/i18n";

interface MapComponentProps {
    address?: string;
    location?: string;
    dictionary?: Dictionary;
}

// Dynamic import for Leaflet components to prevent SSR issues
// This is necessary because Leaflet relies on browser APIs not available during server-side rendering
const MapComponentClient = ({ 
    address, 
    location = contactConfig.location.venueName,
    dictionary
}: MapComponentProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    
    // Use address from props if provided, otherwise use from config
    const venueAddress = address || contactConfig.location.address;
    
    // Get coordinates from contact config with fallback to Brussels
    const lat = contactConfig.location.coordinates.lat || 50.850346;
    const lng = contactConfig.location.coordinates.lng || 4.351710;
    
    // Will hold references to the Leaflet map and marker
    // Using any since we're dynamically importing Leaflet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapRef = useRef<any>(null);
    const loadingText = dictionary?.loading || "Loading map...";
    const errorText = dictionary?.error || "Unable to load map. Please try again later.";

    useEffect(() => {
        // Function to initialize the map
        const initializeMap = async () => {
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

                // If map container exists and Leaflet is loaded
                if (mapContainerRef.current && !mapRef.current) {
                    // Create a new map instance
                    mapRef.current = L.map(mapContainerRef.current).setView([lat, lng], 16);
                    
                    // Add OpenStreetMap tile layer
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }).addTo(mapRef.current);
                    
                    // Add a marker for the location
                    L.marker([lat, lng]).addTo(mapRef.current)
                        .bindPopup(`<b>${location}</b><br>${venueAddress}`)
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
    }, [lat, lng, location, venueAddress]);

    return (
        <div className="ratio ratio-16x9 rounded overflow-hidden border position-relative">
            {isLoading && (
                <div className="position-absolute top-0 start-0 w-100 h-100 bg-dark d-flex align-items-center justify-content-center">
                    <div className="text-center">
                        <Spinner animation="border" variant="light" className="mb-2" />
                        <p className="text-light mb-0">{loadingText}</p>
                    </div>
                </div>
            )}

            {isError && (
                <div className="bg-dark p-4 text-center d-flex align-items-center justify-content-center">
                    <p className="mb-0 text-light">{errorText}</p>
                </div>
            )}
            
            {/* Map container */}
            <div 
                ref={mapContainerRef} 
                className="map-container w-100 h-100"
                style={{ zIndex: 1 }}
            ></div>
        </div>
    );
};

// Use dynamic import with ssr: false to prevent server-side rendering
const MapComponent = dynamic(() => Promise.resolve(MapComponentClient), {
    ssr: false,
    loading: () => (
        <div className="ratio ratio-16x9 rounded overflow-hidden border bg-dark d-flex align-items-center justify-content-center">
            <div className="text-center">
                <Spinner animation="border" variant="light" className="mb-2" />
                <p className="text-light mb-0">Loading map...</p>
            </div>
        </div>
    )
});

export default MapComponent;