import { useEffect, useRef, useState, type FocusEvent } from "react";
// Import Swiper React components
import { Swiper, SwiperSlide } from "swiper/react";
// Import required Swiper modules
import { A11y, Autoplay, Navigation, Pagination } from "swiper/modules";
import type { Swiper as SwiperInstance } from "swiper";
import { BREAKPOINTS, CAROUSEL_SPEED_MS, CAROUSEL_AUTOPLAY_DELAY_MS } from "@/config/constants";

// Import Swiper styles
import "swiper/css";
import "swiper/css/autoplay";
import "swiper/css/navigation";
import "swiper/css/pagination";

/**
 * Represents an item in the carousel
 */
interface CarouselItem {
  id: number;
  name: string;
  image: string;
}

/**
 * Props for the MarqueeSlider component
 * @property {string} itemsType - Type of items to display (producers or sponsors)
 * This prop is used for identification purposes when managing data fetching
 * in parent components, but doesn't affect the component's rendering logic
 */
interface MarqueeSliderProps {
  itemsType?: "producers" | "sponsors";
  items?: CarouselItem[];
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = (event: MediaQueryListEvent): void => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

/**
 * MarqueeSlider component for displaying items in a continuous horizontal scroll
 * Using Swiper for smooth infinite scrolling experience
 */
function MarqueeSlider({ items = [] }: MarqueeSliderProps) {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const previousReducedMotion = useRef(prefersReducedMotion);
  const focusWithin = useRef(false);
  const pointerWithin = useRef(false);

  useEffect(() => {
    if (previousReducedMotion.current === prefersReducedMotion) return;

    if (prefersReducedMotion) {
      swiperRef.current?.autoplay.stop();
    } else {
      swiperRef.current?.autoplay.start();
      if (focusWithin.current || pointerWithin.current) {
        swiperRef.current?.autoplay.pause();
      }
    }
    previousReducedMotion.current = prefersReducedMotion;
  }, [prefersReducedMotion]);

  // Create a new array with default items when no items are passed
  const displayItems =
    items.length === 0
      ? [
          {
            id: 1,
            name: "Champagne Tasting",
            image: "/images/logo.svg",
          },
          {
            id: 2,
            name: "Festival Location",
            image: "/images/logo.svg",
          },
          {
            id: 3,
            name: "Gourmet Experience",
            image: "/images/logo.svg",
          },
          {
            id: 4,
            name: "Wine Experience",
            image: "/images/logo.svg",
          },
          {
            id: 5,
            name: "Food Pairing",
            image: "/images/logo.svg",
          },
          {
            id: 6,
            name: "Masterclass",
            image: "/images/logo.svg",
          },
        ]
      : items;

  // For proper looping, ensure we have enough slides
  // Duplicate items if needed to have at least twice as many as the max slidesPerView (4)
  const minSlides = 8;
  const carouselItems =
    displayItems.length === 0
      ? []
      : Array.from(
          { length: Math.ceil(minSlides / displayItems.length) * displayItems.length },
          (_, index): CarouselItem => displayItems[index % displayItems.length] ?? displayItems[0]!,
        );
  const pauseForFocus = (): void => {
    focusWithin.current = true;
    swiperRef.current?.autoplay.pause();
  };

  const resumeAfterFocus = (event: FocusEvent<HTMLDivElement>): void => {
    focusWithin.current =
      event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
    if (!prefersReducedMotion && !focusWithin.current && !pointerWithin.current) {
      swiperRef.current?.autoplay.resume();
    }
  };

  const pauseForPointer = (): void => {
    pointerWithin.current = true;
    swiperRef.current?.autoplay.pause();
  };

  const resumeAfterPointer = (): void => {
    pointerWithin.current = false;
    if (!prefersReducedMotion && !focusWithin.current) {
      swiperRef.current?.autoplay.resume();
    }
  };

  return (
    <div
      className="marquee-slider mx-auto my-4"
      onFocusCapture={pauseForFocus}
      onBlurCapture={resumeAfterFocus}
      onMouseEnter={pauseForPointer}
      onMouseLeave={resumeAfterPointer}
    >
      <Swiper
        modules={[A11y, Autoplay, Navigation, Pagination]}
        a11y={{ enabled: true }}
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
          if (prefersReducedMotion) swiper.autoplay.stop();
        }}
        spaceBetween={16}
        slidesPerView={4}
        loop={true}
        centeredSlides={true}
        speed={prefersReducedMotion ? 0 : CAROUSEL_SPEED_MS}
        autoplay={{
          delay: CAROUSEL_AUTOPLAY_DELAY_MS,
          pauseOnMouseEnter: false,
          disableOnInteraction: false,
        }}
        navigation={true}
        pagination={{
          clickable: true,
          dynamicBullets: true,
        }}
        breakpoints={{
          // Mobile - 2 items
          [BREAKPOINTS.xs]: {
            slidesPerView: 2,
            spaceBetween: 8,
          },
          // Tablet - 3 items
          [BREAKPOINTS.md]: {
            slidesPerView: 3,
            spaceBetween: 12,
          },
          // Desktop - 4 items
          [BREAKPOINTS.lg]: {
            slidesPerView: 4,
            spaceBetween: 16,
          },
        }}
        className="py-2 pb-5" // Added padding at bottom for pagination
      >
        {carouselItems.map((item, index) => (
          <SwiperSlide key={`${item.id}-${index}`}>
            <div className="marquee-card h-100">
              <div className="marquee-logo-frame overflow-hidden shadow-sm mb-2">
                <div className="position-relative w-100 h-100">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="marquee-logo-image w-100 h-100 object-fit-contain"
                    onError={(e) => {
                      // Quietly set a fallback image without console errors
                      e.currentTarget.src = "/images/logo.svg";
                      // Remove the onError handler to prevent infinite loops if fallback also fails
                      (e.currentTarget as HTMLImageElement).onerror = null;
                    }}
                  />
                </div>
              </div>
              <h5 className="marquee-logo-title text-center small">{item.name}</h5>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}

export default MarqueeSlider;
