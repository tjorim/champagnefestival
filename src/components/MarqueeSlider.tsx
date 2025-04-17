import React from "react";
// Import Swiper React components
import { Swiper, SwiperSlide } from 'swiper/react';
// Import required Swiper modules
import { Autoplay, Navigation, Pagination } from 'swiper/modules';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/autoplay';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

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

/**
 * MarqueeSlider component for displaying items in a continuous horizontal scroll
 * Using Swiper for smooth infinite scrolling experience
 */
const MarqueeSlider: React.FC<MarqueeSliderProps> = ({
    items = []
}) => {
    // Create a new array with default items when no items are passed
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
        },
        {
            id: 4,
            name: "Wine Experience",
            image: "/images/logo.svg"
        },
        {
            id: 5,
            name: "Food Pairing",
            image: "/images/logo.svg"
        },
        {
            id: 6,
            name: "Masterclass",
            image: "/images/logo.svg"
        }
    ] : items;

    // For proper looping, ensure we have enough slides
    // Duplicate items if needed to have at least twice as many as the max slidesPerView (4)
    let carouselItems = [...displayItems];
    while (carouselItems.length < 8) {
        carouselItems = [...carouselItems, ...displayItems];
    }

    return (
        <div className="mx-auto my-4">
            <Swiper
                modules={[Autoplay, Navigation, Pagination]}
                spaceBetween={16}
                slidesPerView={4}
                loop={true}
                centeredSlides={true}
                speed={2000}
                autoplay={{
                    delay: 3000,
                    pauseOnMouseEnter: true,
                    disableOnInteraction: false
                }}
                navigation={true}
                pagination={{
                    clickable: true,
                    dynamicBullets: true
                }}
                breakpoints={{
                    // Mobile - 2 items
                    320: {
                        slidesPerView: 2,
                        spaceBetween: 8
                    },
                    // Tablet - 3 items
                    768: {
                        slidesPerView: 3,
                        spaceBetween: 12
                    },
                    // Desktop - 4 items
                    1024: {
                        slidesPerView: 4,
                        spaceBetween: 16
                    }
                }}
                className="py-2 pb-5" // Added padding at bottom for pagination
            >
                {carouselItems.map((item, index) => (
                    <SwiperSlide key={`${item.id}-${index}`}>
                        <div className="h-100">
                            <div className="overflow-hidden shadow-sm mb-2">
                                <div className="position-relative w-100" style={{ aspectRatio: '4/3' }}>
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className="w-100 h-100 object-fit-contain"
                                        onError={(e) => {
                                            // Quietly set a fallback image without console errors
                                            e.currentTarget.src = '/images/logo.svg';
                                            // Remove the onError handler to prevent infinite loops if fallback also fails
                                            (e.currentTarget as HTMLImageElement).onerror = null;
                                        }}
                                    />
                                </div>
                            </div>
                            <h5 className="text-center small">{item.name}</h5>
                        </div>
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
};

export default MarqueeSlider;