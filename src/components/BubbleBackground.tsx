import React, { useEffect, useState, useRef, useCallback } from "react";
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
    const [bubbles, setBubbles] = useState<React.ReactNode[]>([]);
    const [isLowPerformanceDevice, setIsLowPerformanceDevice] = useState(false);

    // Detect device performance capabilities
    useEffect(() => {
        // Comprehensive device performance detection
        const checkPerformance = () => {
            const indicators = [];
            
            // CPU core check
            if (window.navigator.hardwareConcurrency <= 4) {
                indicators.push('low-cpu');
            }
            
            // Memory check (not supported in all browsers)
            const nav = navigator as Navigator & { deviceMemory?: number };
            if (nav.deviceMemory && nav.deviceMemory <= 4) {
                indicators.push('low-memory');
            }
            
            // Network condition check (not supported in all browsers)
            const connection = (navigator as Navigator & { 
                connection?: { 
                    effectiveType?: string, 
                    saveData?: boolean 
                } 
            }).connection;
            
            if (connection) {
                if (['slow-2g', '2g', '3g'].includes(connection.effectiveType || '')) {
                    indicators.push('low-network');
                }
                if (connection.saveData) {
                    indicators.push('data-saver');
                }
            }
            
            // Mobile device check
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                indicators.push('mobile');
            }
            
            // Consider the device low-performance if it meets any of these criteria
            return indicators.length > 0;
        };

        setIsLowPerformanceDevice(checkPerformance());
    }, []);

    const resizeTimeoutRef = useRef<number | null>(null);

    // Handle window resize and adjust bubble count accordingly
    const handleResize = useCallback(() => {
        if (resizeTimeoutRef.current) window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = window.setTimeout(() => {
            const config = isLowPerformanceDevice
                ? PERFORMANCE_CONFIG.LOW_PERFORMANCE
                : PERFORMANCE_CONFIG.HIGH_PERFORMANCE;

            // Fewer bubbles on small screens
            if (window.innerWidth < 768) {
                setBubbleCount(config.mobileBubbles);
            } else {
                setBubbleCount(config.maxBubbles);
            }
        }, 200);
    }, [isLowPerformanceDevice]);

    // Set up resize listener and initial mounted state
    useEffect(() => {
        setMounted(true);

        handleResize(); // set initial count
        window.addEventListener("resize", handleResize);
        
        // Cleanup function for both resize listener and any pending timeouts
        return () => {
            window.removeEventListener("resize", handleResize);
            
            // Clear any pending resize timeout when component unmounts
            if (resizeTimeoutRef.current) {
                window.clearTimeout(resizeTimeoutRef.current);
                resizeTimeoutRef.current = null;
            }
        };
    }, [handleResize]);

    // Generate bubbles only after mounting to avoid hydration mismatches
    useEffect(() => {
        if (mounted && bubbleCount > 0) {
            // Create a stable seed for randomization to avoid infinite re-renders
            const seed = Date.now(); // Fixed seed for this render cycle
            const random = (index: number, max: number) => {
                // Simple deterministic random number generator using the seed and index
                const value = Math.sin(seed + index) * 10000;
                return Math.abs(value - Math.floor(value)) * max;
            };
            
            const generatedBubbles = Array.from({ length: bubbleCount }, (_, i) => {
                // Adjust animation properties based on performance capacity
                const sizeFactor = isLowPerformanceDevice ? 0.7 : 1;
                const durationFactor = isLowPerformanceDevice ? 1.5 : 1; // slower on low-end devices

                return (
                    <Bubble
                        key={i}
                        size={random(i, 20) * sizeFactor + 5} // between 5px and 25px (or smaller on low-end)
                        duration={(random(i + bubbleCount, 10) + 5) * durationFactor} // between 5s and 15s (or longer on low-end)
                        delay={random(i + bubbleCount * 2, 5)} // delay up to 5s
                        left={random(i + bubbleCount * 3, 100)} // random horizontal position
                    />
                );
            });
            setBubbles(generatedBubbles);
        }
    }, [bubbleCount, mounted, isLowPerformanceDevice]);

    if (!mounted) {
        // Return an empty container during initial render
        return <div className="bubble-container" aria-hidden="true" />;
    }

    return (
        <div className="bubble-container" aria-hidden="true">
            {bubbles}
        </div>
    );
};

export default BubbleBackground;
