import { useEffect, useRef, useState, type ReactNode } from "react";

interface LoadWhenVisibleProps {
  /** Shown, at its final size, until the visitor scrolls near. */
  placeholder: ReactNode;
  children: ReactNode;
  /** How far ahead of the viewport to start loading. */
  rootMargin?: string;
}

/**
 * Mounts `children` only once the placeholder is about to scroll into view, so a heavy
 * below-the-fold chunk (the Leaflet map) is not fetched on every visit. Browsers without
 * IntersectionObserver mount immediately. Give the placeholder the same size as the content,
 * so nothing jumps when it is swapped.
 */
const LoadWhenVisible = ({ placeholder, children, rootMargin = "600px" }: LoadWhenVisibleProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (visible || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return visible ? <>{children}</> : <div ref={ref}>{placeholder}</div>;
};

export default LoadWhenVisible;
