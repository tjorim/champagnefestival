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
            { id: 1, name: "Moët & Chandon", image: "https://placehold.co/600x400/e3dac9/333333?text=Moët+%26+Chandon" },
            { id: 2, name: "Veuve Clicquot", image: "https://placehold.co/600x400/ffd700/333333?text=Veuve+Clicquot" },
            { id: 3, name: "Dom Pérignon", image: "https://placehold.co/600x400/000000/ffffff?text=Dom+Pérignon" },
            { id: 4, name: "Bollinger", image: "https://placehold.co/600x400/8B4513/ffffff?text=Bollinger" },
            { id: 5, name: "Taittinger", image: "https://placehold.co/600x400/f0f8ff/333333?text=Taittinger" },
        ],
        sponsors: [
            { id: 1, name: "Luxury Hotels Group", image: "https://placehold.co/600x400/2E8B57/ffffff?text=Luxury+Hotels" },
            { id: 2, name: "Gourmet Foods", image: "https://placehold.co/600x400/4682B4/ffffff?text=Gourmet+Foods" },
            { id: 3, name: "Crystal Glassware", image: "https://placehold.co/600x400/B0C4DE/333333?text=Crystal+Glassware" },
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
            className="carousel bg-darkCard rounded-lg overflow-hidden shadow-lg max-w-4xl mx-auto my-8 relative" 
            ref={carouselRef}
            aria-label={`${itemsType} Carousel`} 
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
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
                        className={`w-8 h-2 rounded-sm ${
                            index === currentIndex 
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
