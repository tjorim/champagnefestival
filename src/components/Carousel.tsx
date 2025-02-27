import React, { useState, useEffect, useCallback, useRef } from "react";

/**
 * Represents an item in the carousel
 */
interface CarouselItem {
    id: number;
    name: string;
    image: string;
}

/**
 * Props for the Carousel component
 * @property {string} itemsType - Type of items to display (producers or sponsors)
 */
interface CarouselProps {
    itemsType: "producers" | "sponsors";
    items?: CarouselItem[];
    autoRotateInterval?: number;
}

/**
 * Carousel component for displaying rotating images with navigation
 * Features:
 * - Auto-rotation with configurable interval
 * - Keyboard navigation support
 * - Touch support (swipe left/right)
 * - Pause on hover/focus
 */
const Carousel: React.FC<CarouselProps> = ({ itemsType, items = [], autoRotateInterval = 3000 }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const carouselRef = useRef<HTMLDivElement>(null);
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);

    // Navigation handlers
    const handleNext = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % items.length);
    }, [items.length]);

    const handlePrev = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + items.length) % items.length);
    }, [items.length]);

    // Touch handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (!touchStartX.current || !touchEndX.current) return;

        const diff = touchStartX.current - touchEndX.current;
        const threshold = 50; // minimum distance for swipe

        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                handleNext(); // Swipe left, go next
            } else {
                handlePrev(); // Swipe right, go prev
            }
        }

        // Reset values
        touchStartX.current = null;
        touchEndX.current = null;
    };

    // Auto-rotation with pause capability
    useEffect(() => {
        if (items.length <= 1 || isPaused) return;

        const interval = setInterval(handleNext, autoRotateInterval);
        return () => clearInterval(interval);
    }, [items.length, isPaused, handleNext, autoRotateInterval]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle events when carousel is focused
            if (!carouselRef.current?.contains(document.activeElement)) return;

            switch (e.key) {
                case 'ArrowLeft':
                    handlePrev();
                    break;
                case 'ArrowRight':
                    handleNext();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrev]);

    // Early return if no items available
    if (items.length === 0) return null;

    return (
        <div
            className="carousel bg-darkCard rounded-lg overflow-hidden shadow-lg max-w-4xl mx-auto my-8 relative"
            ref={carouselRef}
            aria-label={`${itemsType} Carousel`}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            role="region"
            style={{ maxWidth: "95vw" }}
        >
            <div className="carousel-content relative p-6 flex items-center justify-between">
                <button
                    onClick={handlePrev}
                    aria-label="Previous slide"
                    className="carousel-button absolute left-2 sm:left-4 z-10 h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors text-white text-xl sm:text-2xl opacity-70 hover:opacity-100 focus:opacity-100"
                >
                    ‹
                </button>

                <div
                    className="carousel-item flex-1 mx-auto px-8 sm:px-12 w-full max-w-full sm:max-w-2xl"
                    aria-live="polite"
                >
                    <div className="relative overflow-hidden rounded-lg aspect-video shadow-md">
                        <img
                            src={items[currentIndex].image}
                            alt={items[currentIndex].name}
                            className="carousel-image w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.src = 'path/to/fallback-image.jpg';
                                e.currentTarget.onerror = null; // Prevent infinite loops
                            }}
                        />
                    </div>
                    <p className="carousel-caption mt-4 text-lg font-medium text-center">{items[currentIndex].name}</p>
                </div>

                <button
                    onClick={handleNext}
                    aria-label="Next slide"
                    className="carousel-button absolute right-2 sm:right-4 z-10 h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors text-white text-xl sm:text-2xl opacity-70 hover:opacity-100 focus:opacity-100"
                >
                    ›
                </button>
            </div>

            {/* Slide indicators */}
            <div className="carousel-indicators flex justify-center space-x-3 pb-5">
                {items.map((_, index) => (
                    <button
                        key={index}
                        className={`w-8 h-2 rounded-sm ${index === currentIndex
                            ? 'bg-indigo-500 w-12'
                            : 'bg-gray-600 hover:bg-gray-500'
                            } transition-all duration-300`}
                        onClick={() => setCurrentIndex(index)}
                        aria-label={`Go to slide ${index + 1}`}
                        aria-current={index === currentIndex ? 'true' : 'false'}
                    />
                ))}
            </div>
        </div>
    );
};

export default Carousel;
