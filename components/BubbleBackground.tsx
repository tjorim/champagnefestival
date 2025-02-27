import React, { useEffect, useState, useCallback } from "react";
import Bubble from "./Bubble";

/**
 * Configuration for performance optimization
 */
const PERFORMANCE_CONFIG = {
  HIGH_PERFORMANCE: {
    maxBubbles: 50,
    mobileBubbles: 20
  },
  LOW_PERFORMANCE: {
    maxBubbles: 25,
    mobileBubbles: 10
  }
};

/**
 * BubbleBackground component creates an animated background of rising bubbles
 * The component handles:
 * - Client-side only rendering to avoid hydration mismatches
 * - Responsive design (fewer bubbles on mobile)
 * - Performance optimization based on device capabilities
 */
const BubbleBackground: React.FC = () => {
    const [bubbleCount, setBubbleCount] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [bubbles, setBubbles] = useState<JSX.Element[]>([]);
    const [isLowPerformanceDevice, setIsLowPerformanceDevice] = useState(false);

    // Detect low performance devices (could be expanded with more sophisticated checks)
    useEffect(() => {
        // Simple performance detection - could be expanded with more sophisticated checks
        const isLowEnd = 
            window.navigator.hardwareConcurrency <= 4 || 
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        setIsLowPerformanceDevice(isLowEnd);
    }, []);

    // Handle window resize and adjust bubble count accordingly
    const handleResize = useCallback(() => {
        const config = isLowPerformanceDevice 
            ? PERFORMANCE_CONFIG.LOW_PERFORMANCE 
            : PERFORMANCE_CONFIG.HIGH_PERFORMANCE;

        // Fewer bubbles on small screens
        if (window.innerWidth < 768) {
            setBubbleCount(config.mobileBubbles);
        } else {
            setBubbleCount(config.maxBubbles);
        }
    }, [isLowPerformanceDevice]);

    // Set up resize listener and initial mounted state
    useEffect(() => {
        setMounted(true);
        
        handleResize(); // set initial count
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [handleResize]);

    // Generate bubbles only after mounting to avoid hydration mismatches
    useEffect(() => {
        if (mounted && bubbleCount > 0) {
            const generatedBubbles = Array.from({ length: bubbleCount }, (_, i) => {
                // Adjust animation properties based on performance capacity
                const sizeFactor = isLowPerformanceDevice ? 0.7 : 1;
                const durationFactor = isLowPerformanceDevice ? 1.5 : 1; // slower on low-end devices
                
                return (
                    <Bubble
                        key={i}
                        size={Math.random() * 20 * sizeFactor + 5} // between 5px and 25px (or smaller on low-end)
                        duration={(Math.random() * 10 + 5) * durationFactor} // between 5s and 15s (or longer on low-end)
                        delay={Math.random() * 5} // delay up to 5s
                        left={Math.random() * 100} // random horizontal position
                    />
                );
            });
            setBubbles(generatedBubbles);
        }
    }, [bubbleCount, mounted, isLowPerformanceDevice]);

    if (!mounted) {
        // Return an empty container with suppressHydrationWarning on the server
        return <div className="bubble-container" suppressHydrationWarning aria-hidden="true" />;
    }

    return (
        <div className="bubble-container" aria-hidden="true" style={{ zIndex: 1 }}>
            {bubbles}
        </div>
    );
};

export default BubbleBackground;
