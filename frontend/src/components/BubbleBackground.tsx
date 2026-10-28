import React, { useEffect, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import Bubble from "./Bubble";
import { BREAKPOINTS, RESIZE_DEBOUNCE_MS } from "@/config/constants";

/**
 * Configuration for performance optimization
 */
const PERFORMANCE_CONFIG = {
  HIGH_PERFORMANCE: {
    maxBubbles: 50,
    mobileBubbles: 20,
  },
  LOW_PERFORMANCE: {
    maxBubbles: 25,
    mobileBubbles: 10,
  },
};

/**
 * BubbleBackground component creates an animated background of rising bubbles
 * The component handles:
 * - Client-side only rendering to avoid hydration mismatches
 * - Responsive design (fewer bubbles on mobile)
 * - Performance optimization based on device capabilities
 */
// Comprehensive device performance detection
function checkPerformance() {
  if (typeof navigator === "undefined") return false;
  const indicators = [];

  // CPU core check
  if (navigator.hardwareConcurrency <= 4) {
    indicators.push("low-cpu");
  }

  // Memory check (not supported in all browsers)
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory && nav.deviceMemory <= 4) {
    indicators.push("low-memory");
  }

  // Network condition check (not supported in all browsers)
  const connection = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
      };
    }
  ).connection;

  if (connection) {
    if (["slow-2g", "2g", "3g"].includes(connection.effectiveType || "")) {
      indicators.push("low-network");
    }
    if (connection.saveData) {
      indicators.push("data-saver");
    }
  }

  // Mobile device check
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    indicators.push("mobile");
  }

  // Consider the device low-performance if it meets any of these criteria
  return indicators.length > 0;
}

const BubbleBackground: React.FC = () => {
  const mounted = useHydrated();
  const [isLowPerformanceDevice] = useState(checkPerformance);
  const [seed] = useState(() => Date.now());
  const config = isLowPerformanceDevice
    ? PERFORMANCE_CONFIG.LOW_PERFORMANCE
    : PERFORMANCE_CONFIG.HIGH_PERFORMANCE;
  const [bubbleCount, setBubbleCount] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < BREAKPOINTS.md
      ? config.mobileBubbles
      : config.maxBubbles,
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          setBubbleCount(
            window.innerWidth < BREAKPOINTS.md ? config.mobileBubbles : config.maxBubbles,
          ),
        RESIZE_DEBOUNCE_MS,
      );
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      clearTimeout(timer);
    };
  }, [config]);
  const random = (index: number, max: number) => {
    const value = Math.sin(seed + index) * 10000;
    return Math.abs(value - Math.floor(value)) * max;
  };
  const sizeFactor = isLowPerformanceDevice ? 0.7 : 1;
  const durationFactor = isLowPerformanceDevice ? 1.5 : 1;
  return (
    <div className="bubble-container" aria-hidden="true">
      {mounted &&
        Array.from({ length: bubbleCount }, (_, i) => (
          <Bubble
            key={i}
            size={random(i, 20) * sizeFactor + 5}
            duration={(random(i + bubbleCount, 10) + 5) * durationFactor}
            delay={random(i + bubbleCount * 2, 5)}
            left={random(i + bubbleCount * 3, 100)}
          />
        ))}
    </div>
  );
};
export default BubbleBackground;
