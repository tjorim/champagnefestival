// A very simple carousel that cycles through dummy images.

import React, { useState, useEffect } from "react";

const Carousel: React.FC<{ itemsType: 'producers' | 'sponsors' }> = ({ itemsType }) => {
    // Replace this dummy data with your real images and data.
    const data = {
        producers: [
            { id: 1, name: "Producer 1", image: "https://placehold.co/600x400" }, //producer1.jpg
            { id: 2, name: "Producer 2", image: "https://placehold.co/600x400" }, //producer2.jpg
            { id: 3, name: "Producer 3", image: "https://placehold.co/600x400" }, //producer3.jpg
        ],
        sponsors: [
            { id: 1, name: "Sponsor 1", image: "https://placehold.co/600x400" }, //sponsor1.jpg
            { id: 2, name: "Sponsor 2", image: "https://placehold.co/600x400" }, //sponsor2.jpg
            { id: 3, name: "Sponsor 3", image: "https://placehold.co/600x400" }, //sponsor3.jpg
        ],
    };

    const items = data[itemsType] || [];
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % items.length);
        }, 3000); // change image every 3 seconds
        return () => clearInterval(interval);
    }, [items.length]);

    if (items.length === 0) return null;

    return (
        <div className="carousel">
            <img src={items[currentIndex].image} alt={items[currentIndex].name} />
            <p>{items[currentIndex].name}</p>
        </div>
    );
};


export default Carousel;
