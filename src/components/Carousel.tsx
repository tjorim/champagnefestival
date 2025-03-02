import React, { useState } from "react";
import { Card, Carousel as BootstrapCarousel } from "react-bootstrap";

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
 * Using react-bootstrap carousel component
 */
const Carousel: React.FC<CarouselProps> = ({ 
    items = [], 
    autoRotateInterval = 3000 
}) => {
    const [index, setIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const handleSelect = (selectedIndex: number) => {
        setIndex(selectedIndex);
    };

    // Early return if no items available
    if (items.length === 0) return null;

    return (
        <Card className="max-w-4xl mx-auto my-8">
            <Card.Body className="p-1 sm:p-6">
                <BootstrapCarousel
                    activeIndex={index}
                    onSelect={handleSelect}
                    interval={isPaused ? undefined : autoRotateInterval}
                    indicators={true}
                    controls={true}
                    pause="hover"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                >
                    {items.map((item) => (
                        <BootstrapCarousel.Item key={item.id}>
                            <div className="p-1">
                                <div className="overflow-hidden rounded-lg shadow-md">
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className="w-full h-auto aspect-video object-cover"
                                        onError={(e) => {
                                            e.currentTarget.src = 'path/to/fallback-image.jpg';
                                            e.currentTarget.onerror = null; // Prevent infinite loops
                                        }}
                                    />
                                </div>
                                <p className="mt-4 text-lg font-medium text-center">{item.name}</p>
                            </div>
                        </BootstrapCarousel.Item>
                    ))}
                </BootstrapCarousel>
                
                {/* Custom indicators - optional as Bootstrap Carousel has built-in indicators */}
                <div className="flex justify-center gap-2 mt-4 pb-2">
                    {items.map((_, i) => (
                        <button
                            key={i}
                            className={`h-2 rounded-full transition-all duration-300 ${
                                i === index ? "w-12 bg-primary" : "w-8 bg-neutral-600 hover:bg-neutral-500"
                            }`}
                            onClick={() => setIndex(i)}
                            aria-label={`Go to slide ${i + 1}`}
                            aria-current={i === index ? 'true' : 'false'}
                        />
                    ))}
                </div>
            </Card.Body>
        </Card>
    );
};

export default Carousel;
