'use client';

import React, { useState } from "react";
import { Carousel as BootstrapCarousel } from "react-bootstrap";
import Image from "next/image";

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
 * This prop is used for identification purposes when managing data fetching
 * in parent components, but doesn't affect the component's rendering logic
 */
interface CarouselProps {
    itemsType?: "producers" | "sponsors";
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

    // Create a new array with default items when no items are passed instead of modifying props
    const displayItems = items.length === 0 ? [
        {
            id: 1,
            name: "Champagne Tasting",
            image: "/images/logo.svg"
        },
        {
            id: 2,
            name: "Festival Location",
            image: "/images/logo.svg"
        },
        {
            id: 3,
            name: "Gourmet Experience",
            image: "/images/logo.svg"
        }
    ] : items;

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
                {displayItems.map((item) => (
                    <BootstrapCarousel.Item key={item.id}>
                        <div className="overflow-hidden rounded shadow-sm">
                            <div className="position-relative w-100" style={{ aspectRatio: '16/9' }}>
                                <Image
                                    src={item.image}
                                    alt={item.name}
                                    fill
                                    sizes="(max-width: 768px) 100vw, 800px"
                                    className="carousel-image object-cover rounded"
                                    onError={() => {
                                        // Using a fallback image if the main image fails to load
                                        console.error(`Failed to load image: ${item.image}`);
                                    }}
                                />
                            </div>
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