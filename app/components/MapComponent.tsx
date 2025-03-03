'use client';

import { useState } from "react";
import { Spinner } from "react-bootstrap";

interface MapComponentProps {
    embedUrl?: string;
    address?: string;
    location?: string;
}

const MapComponent = ({
    embedUrl,
    address = "123 Festival Boulevard, City Center",
    location = "Event Location"
}: MapComponentProps) => {
    // Generate an embed URL from the address if not provided directly
    const mapUrl = embedUrl || `https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=${encodeURIComponent(address)}`;
    
    // For demo purposes, if no API key, fallback to static map
    const finalEmbedUrl = mapUrl.includes('YOUR_API_KEY') 
        ? "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d126743.10326264522!2d4.3517101!3d50.850346!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c3c38047e4b4fd%3A0x9f6a8e4d3c3c9e0!2sBrussels%2C%20Belgium!5e0!3m2!1sen!2sus!4v1616177609532!5m2!1sen!2sus"
        : mapUrl;
    const [iframeError, setIframeError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const handleIframeError = () => {
        setIframeError(true);
        setIsLoading(false);
    };

    const handleIframeLoad = () => {
        setIsLoading(false);
    };

    return (
        <div className="ratio ratio-16x9 rounded overflow-hidden border position-relative">
            {isLoading && (
                <div className="position-absolute top-0 start-0 w-100 h-100 bg-dark d-flex align-items-center justify-content-center">
                    <div className="text-center">
                        <Spinner animation="border" variant="light" className="mb-2" />
                        <p className="text-light mb-0">Loading map...</p>
                    </div>
                </div>
            )}

            {iframeError ? (
                <div className="bg-dark p-4 text-center d-flex align-items-center justify-content-center">
                    <p className="mb-0 text-light">Unable to load map. Please try again later.</p>
                </div>
            ) : (
                <iframe
                    title={location}
                    src={finalEmbedUrl}
                    className={`border-0 map-iframe ${isLoading ? 'map-iframe-loading' : 'map-iframe-loaded'}`}
                    loading="lazy"
                    onError={handleIframeError}
                    onLoad={handleIframeLoad}
                    allowFullScreen
                ></iframe>
            )}
        </div>
    );
};

export default MapComponent;