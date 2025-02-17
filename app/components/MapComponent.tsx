import React, { useState } from "react";

const MapComponent = () => {
    const [iframeError, setIframeError] = useState(false);

    const handleIframeError = () => {
        setIframeError(true);
    };

    return (
        <div className="map-container">
            {iframeError ? (
                <div className="map-error">
                    <p>Unable to load map. Please try again later.</p>
                </div>
            ) : (
                <iframe
                    title="Event Location"
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d126743.10326264522!2d4.3517101!3d50.850346!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c3c38047e4b4fd%3A0x9f6a8e4d3c3c9e0!2sBrussels%2C%20Belgium!5e0!3m2!1sen!2sus!4v1616177609532!5m2!1sen!2sus"
                    width="100%"
                    height="450"
                    style={{ border: 0 }}
                    loading="lazy"
                    onError={handleIframeError}
                ></iframe>
            )}
        </div>
    );
};

export default MapComponent;
