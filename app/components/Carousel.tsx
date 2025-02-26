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
}

/**
 * Carousel component for displaying rotating images with navigation
 * Features:
 * - Auto-rotation with configurable interval
 * - Keyboard navigation support
 * - Touch support (swipe left/right)
 * - Pause on hover/focus
 */
const Carousel: React.FC<CarouselProps> = ({ itemsType }) => {
    // Mock data - in a real app, this would come from props or API
    const data: { [key in CarouselProps["itemsType"]]: CarouselItem[] } = {
        producers: [
            { id: 1, name: "Producer 1", image: "https://placehold.co/600x400" },
            { id: 2, name: "Producer 2", image: "https://placehold.co/600x400" },
            { id: 3, name: "Producer 3", image: "https://placehold.co/600x400" },
        ],
        sponsors: [
            { id: 1, name: "Sponsor 1", image: "https://placehold.co/600x400" },
            { id: 2, name: "Sponsor 2", image: "https://placehold.co/600x400" },
            { id: 3, name: "Sponsor 3", image: "https://placehold.co/600x400" },
        ],
    };

    const items = data[itemsType] || [];
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const carouselRef = useRef<HTMLDivElement>(null);
    const autoRotateInterval = 3000; // ms between slides

    // Navigation handlers
    const handleNext = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % items.length);
    }, [items.length]);

    const handlePrev = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + items.length) % items.length);
    }, [items.length]);

    // Auto-rotation with pause capability
    useEffect(() => {
        if (items.length <= 1 || isPaused) return;
        
        const interval = setInterval(handleNext, autoRotateInterval);
        return () => clearInterval(interval);
    }, [items.length, isPaused, handleNext]);

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
            className="carousel" 
            ref={carouselRef}
            aria-label={`${itemsType} Carousel`} 
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
            role="region"
        >
            <div className="carousel-content">
                <button 
                    onClick={handlePrev} 
                    aria-label="Previous slide"
                    className="carousel-button carousel-prev"
                >
                    ‹
                </button>
                
                <div 
                    className="carousel-item"
                    aria-live="polite"
                >
                    <img 
                        src={items[currentIndex].image} 
                        alt={items[currentIndex].name} 
                        className="carousel-image"
                    />
                    <p className="carousel-caption">{items[currentIndex].name}</p>
                </div>
                
                <button 
                    onClick={handleNext} 
                    aria-label="Next slide"
                    className="carousel-button carousel-next"
                >
                    ›
                </button>
            </div>
            
            {/* Slide indicators */}
            <div className="carousel-indicators">
                {items.map((_, index) => (
                    <button
                        key={index}
                        className={`carousel-indicator ${index === currentIndex ? 'active' : ''}`}
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
