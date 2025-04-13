import { useEffect } from 'react';

/**
 * Custom hook to handle hash-based navigation and section tracking
 * Features:
 * - Smooth scrolling to sections based on URL hash
 * - Updates URL hash when scrolling between sections
 * - Sets appropriate ARIA attributes for accessibility
 * - Throttles scroll events for performance
 */
export function useScrollNavigation() {
  useEffect(() => {
    // Function to handle direct navigation via hash
    const scrollToHashSection = () => {
      if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          // Delay to ensure lazy-loaded content is rendered
          setTimeout(() => {
            targetElement.scrollIntoView({ behavior: 'smooth' });
          }, 300);
        }
      }
    };
    
    // Execute on initial load
    scrollToHashSection();
    
    // Update URL hash when scrolling between sections
    const handleScroll = () => {
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
    
    // Add event listeners
    window.addEventListener('scroll', throttledScroll);
    window.addEventListener('hashchange', scrollToHashSection);
    
    // Clean up
    return () => {
      window.removeEventListener('scroll', throttledScroll);
      window.removeEventListener('hashchange', scrollToHashSection);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);
}