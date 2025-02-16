// This component renders animated “bubbles” using CSS.

import React, { useEffect } from "react";

const ChampagneBubbles = () => {
    useEffect(() => {
        // Optionally, you can generate bubbles dynamically if needed.
    }, []);

    return (
        <div className="champagne-bubbles">
            {Array.from({ length: 20 }).map((_, i) => (
                <div
                    key={i}
                    className="bubble"
                    style={{
                        left: `${Math.random() * 100}%`,
                        animationDuration: `${3 + Math.random() * 5}s`,
                    }}
                ></div>
            ))}
        </div>
    );
};

export default ChampagneBubbles;
