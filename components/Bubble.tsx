import React from "react";

/**
 * Props for the Bubble component
 * @property {number} size - Size of the bubble in pixels
 * @property {number} duration - Duration of the animation in seconds
 * @property {number} delay - Delay before animation starts in seconds
 * @property {number} left - Horizontal position of the bubble in percentage
 */
interface BubbleProps {
    size: number;
    duration: number;
    delay: number;
    left: number;
}

/**
 * Renders a single animated bubble
 * CSS Variables:
 * --bubble-size: Sets the width and height of the bubble
 * --bubble-duration: Controls how long the bubble takes to rise
 * --bubble-delay: Sets when the bubble starts its animation
 * --bubble-left: Controls the horizontal position of the bubble
 */
const Bubble: React.FC<BubbleProps> = ({ size, duration, delay, left }) => (
    <div
        className="bubble"
        style={{
            "--bubble-size": `${size}px`,
            "--bubble-duration": `${duration}s`,
            "--bubble-delay": `${delay}s`,
            "--bubble-left": `${left}%`,
        } as React.CSSProperties}
        aria-hidden="true" // Decorative content, hidden from screen readers
    />
);

export default Bubble;
