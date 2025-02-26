import { useState, useEffect } from 'react';

/**
 * Window size and responsive breakpoint information
 */
interface WindowSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

/**
 * Hook to get window dimensions and responsive breakpoints
 * @returns WindowSize object with current dimensions and device breakpoints
 */
export function useWindowSize(): WindowSize {
  // Initialize with default values to prevent hydration issues
  const [windowSize, setWindowSize] = useState<WindowSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    isMobile: false,
    isTablet: false,
    isDesktop: true
  });
  
  useEffect(() => {
    // Skip on server
    if (typeof window === 'undefined') return;
    
    // Handler to call on window resize
    function handleResize() {
      const width = window.innerWidth;
      setWindowSize({
        width,
        height: window.innerHeight,
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024
      });
    }
    
    // Add event listener
    window.addEventListener("resize", handleResize);
    
    // Call handler right away
    handleResize();
    
    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  return windowSize;
}