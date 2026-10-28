import { useEffect, useState } from "react";

/** A render-safe clock that refreshes periodically and when a hidden page becomes visible. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") update();
    };
    const timer = window.setInterval(update, intervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
  return now;
}
