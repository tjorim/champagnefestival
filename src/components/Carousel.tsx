import React, { useState } from "react";
import { Carousel as BootstrapCarousel } from "react-bootstrap";

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
 * Using react-bootstrap carousel component with native styling
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
        <div className="mx-auto my-4">
            <BootstrapCarousel
                activeIndex={index}
                onSelect={handleSelect}
                interval={isPaused ? undefined : autoRotateInterval}
                indicators={true}
                controls={true}
                pause="hover"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                className="carousel-with-rounded-images"
            >
                {items.map((item) => (
                    <BootstrapCarousel.Item key={item.id}>
                        <div className="overflow-hidden rounded shadow-sm">
                            <img
                                src={item.image}
                                alt={item.name}
                                className="w-100 img-fluid carousel-image"
                                onError={(e) => {
                                    e.currentTarget.src = 'path/to/fallback-image.jpg';
                                    e.currentTarget.onerror = null;
                                }}
                            />
                        </div>
                        <BootstrapCarousel.Caption>
                            <h3>{item.name}</h3>
                        </BootstrapCarousel.Caption>
                    </BootstrapCarousel.Item>
                ))}
            </BootstrapCarousel>
        </div>
    );
};

export default Carousel;
