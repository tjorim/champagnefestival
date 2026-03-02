import { useEffect, useRef } from 'react';

/**
 * Custom hook to handle hash-based navigation and section tracking
 * Features:
 * - Smooth scrolling to sections based on URL hash
 * - Updates URL hash when scrolling between sections
 * - Sets appropriate ARIA attributes for accessibility
 * - Throttles scroll events for performance
 */
export function useScrollNavigation() {
  const hasScrolledToInitialHash = useRef(false);
  const initialHashRef = useRef(window.location.hash);
  const targetElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Function to scroll to target element and maintain position
    const scrollToTarget = () => {
      if (targetElementRef.current) {
        targetElementRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // Function to handle initial hash navigation
    const handleInitialHash = () => {
      if (initialHashRef.current && !hasScrolledToInitialHash.current) {
        const targetId = initialHashRef.current.substring(1);
        
        
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
          targetElementRef.current = targetElement;
          hasScrolledToInitialHash.current = true;
          
          // Use ResizeObserver to maintain scroll position as content loads
          const resizeObserver = new ResizeObserver(() => {
            // Re-scroll to maintain position when content height changes
            scrollToTarget();
          });
          
          // Observe the main container for size changes
          const main = document.querySelector('main');
          if (main) {
            resizeObserver.observe(main);
          }
          
          // Initial scroll
          scrollToTarget();
          
          // Clean up observer after a delay (when content should be loaded)
          setTimeout(() => {
            resizeObserver.disconnect();
          }, 2000);
        }
      }
    };

    // Try to handle initial hash
    handleInitialHash();

    // Update URL hash when scrolling between sections (but not during initial load)
    const handleScroll = () => {
      // Only update hash from scrolling after we've handled the initial hash
      if (!hasScrolledToInitialHash.current) return;
      
      // Debounce for performance
      if (window.scrollY > 100) { // Only update when scrolled past the top
        const sections = document.querySelectorAll('section[id]');

        // Find the section closest to the top of the viewport
        const active = Array.from(sections).reduce((nearest, section) => {
          const rect = section.getBoundingClientRect();
          const offset = Math.abs(rect.top);

          return offset < Math.abs(nearest.rect.top)
            ? { id: section.id, rect }
            : nearest;
        }, { id: '', rect: { top: Infinity } as DOMRect });

        // Update URL if we found an active section
        if (active.id && window.location.hash !== `#${active.id}`) {
          // Use replaceState to avoid creating new history entries while scrolling
          window.history.replaceState(null, '', `#${active.id}`);

          // Update aria-current for accessibility
          sections.forEach(section => {
            if (section.id === active.id) {
              section.setAttribute('aria-current', 'true');
              section.setAttribute('tabindex', '-1'); // Make focusable but not in tab order
            } else {
              section.removeAttribute('aria-current');
              section.removeAttribute('tabindex');
            }
          });
        }
      }
    };

    // Add throttled scroll listener
    let timeout: number | null = null;
    const throttledScroll = () => {
      if (timeout === null) {
        timeout = window.setTimeout(() => {
          handleScroll();
          timeout = null;
        }, 100);
      }
    };

    // Handle manual hash changes (not from scroll)
    const handleHashChange = () => {
      const previousHash = initialHashRef.current;
      const currentHash = window.location.hash;
      
      // Only handle manual navigation, not programmatic hash updates
      if (currentHash !== previousHash) {
        initialHashRef.current = currentHash;
        hasScrolledToInitialHash.current = false;
        handleInitialHash();
      }
    };

    // Add event listeners
    window.addEventListener('scroll', throttledScroll);
    window.addEventListener('hashchange', handleHashChange);

    // Clean up
    return () => {
      window.removeEventListener('scroll', throttledScroll);
      window.removeEventListener('hashchange', handleHashChange);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []); // Run only once on mount
}