import React, { useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Navigation, Autoplay } from "swiper/modules";

// Import Swiper styles
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";

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
 * Using Swiper for a modern, touch-friendly carousel experience
 */
const Carousel: React.FC<CarouselProps> = ({
    items = [],
    autoRotateInterval = 3000
}) => {
    const [isPaused, setIsPaused] = useState(false);

    // Early return if no items available
    if (items.length === 0) return null;

    return (
        <div className="mx-auto my-4">
            <Swiper
                modules={[Pagination, Navigation, Autoplay]}
                spaceBetween={30}
                slidesPerView={1}
                pagination={{ clickable: true }}
                navigation={true}
                autoplay={isPaused ? false : { 
                    delay: autoRotateInterval, 
                    disableOnInteraction: false 
                }}
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                className="carousel-with-rounded-images"
            >
                {items.map((item) => (
                    <SwiperSlide key={item.id}>
                        <div className="overflow-hidden rounded shadow-sm text-center">
                            <img
                                src={item.image}
                                alt={item.name}
                                className="w-100 img-fluid carousel-image"
                                onError={(e) => {
                                    e.currentTarget.src = 'path/to/fallback-image.jpg';
                                    e.currentTarget.onerror = null;
                                }}
                            />
                            <div className="my-2 carousel-caption">
                                <h3>{item.name}</h3>
                            </div>
                        </div>
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
};

export default Carousel;
