import React from "react";

interface BubbleProps {
    size: number;
    duration: number;
    delay: number;
    left: number;
}

const Bubble: React.FC<BubbleProps> = ({ size, duration, delay, left }) => (
    <div
        className="bubble"
        style={{
            "--bubble-size": `${size}px`,
            "--bubble-duration": `${duration}s`,
            "--bubble-delay": `${delay}s`,
            "--bubble-left": `${left}%`,
        } as React.CSSProperties}
    />
);

export default Bubble;
