import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The hidden bubbles toggle: typing "bubbles" or tapping the brand five times flips it, and the
 * choice is remembered in local storage.
 */
export function useBubblesEasterEgg() {
  const [showBubbles, setShowBubbles] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("champagnefestival:bubbles") === "true";
    } catch {
      return false;
    }
  });
  const bubbleTapCountRef = useRef(0);
  const bubbleTapResetRef = useRef<number | null>(null);
  const bubbleKeyBufferRef = useRef("");

  useEffect(() => {
    try {
      window.localStorage.setItem("champagnefestival:bubbles", String(showBubbles));
    } catch {
      // Storage may be unavailable (disabled, sandboxed iframe, quota exceeded); bubble toggle just won't persist.
    }
  }, [showBubbles]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.length !== 1) return;

      bubbleKeyBufferRef.current = `${bubbleKeyBufferRef.current}${event.key.toLowerCase()}`.slice(
        -7,
      );

      if (bubbleKeyBufferRef.current.endsWith("bubbles")) {
        setShowBubbles((enabled) => !enabled);
        bubbleKeyBufferRef.current = "";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (bubbleTapResetRef.current) {
        window.clearTimeout(bubbleTapResetRef.current);
      }
    };
  }, []);

  const handleBrandClick = useCallback(() => {
    bubbleTapCountRef.current += 1;

    if (bubbleTapResetRef.current) {
      window.clearTimeout(bubbleTapResetRef.current);
    }

    bubbleTapResetRef.current = window.setTimeout(() => {
      bubbleTapCountRef.current = 0;
      bubbleTapResetRef.current = null;
    }, 1400);

    if (bubbleTapCountRef.current >= 5) {
      setShowBubbles((enabled) => !enabled);
      bubbleTapCountRef.current = 0;
    }
  }, []);

  return { showBubbles, handleBrandClick };
}
