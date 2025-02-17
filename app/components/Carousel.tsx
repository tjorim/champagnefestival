import React, { useState, useEffect } from "react";

interface CarouselItem {
    id: number;
    name: string;
    image: string;
}

interface CarouselProps {
    itemsType: "producers" | "sponsors";
}

const Carousel: React.FC<CarouselProps> = ({ itemsType }) => {
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

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % items.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [items.length]);

    if (items.length === 0) return null;

    const handleNext = () => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % items.length);
    };

    const handlePrev = () => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + items.length) % items.length);
    };

    return (
        <div className="carousel" aria-label="Image Carousel">
            <div className="carousel-content">
                <button onClick={handlePrev} aria-label="Previous slide">
                    ‹
                </button>
                <div className="carousel-item">
                    <img src={items[currentIndex].image} alt={items[currentIndex].name} />
                    <p>{items[currentIndex].name}</p>
                </div>
                <button onClick={handleNext} aria-label="Next slide">
                    ›
                </button>
            </div>
        </div>
    );
};

export default Carousel;
