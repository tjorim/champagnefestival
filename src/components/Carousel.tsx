import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel as ShadcnCarousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

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
 * Using shadcn/ui carousel component
 */
const Carousel: React.FC<CarouselProps> = ({ 
    itemsType, 
    items = [], 
    autoRotateInterval = 3000 
}) => {
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const intervalRef = useRef<number | null>(null);

    // Set up the carousel API and current slide state
    useEffect(() => {
        if (!api) {
            return;
        }

        setCurrent(api.selectedScrollSnap());
        
        api.on("select", () => {
            setCurrent(api.selectedScrollSnap());
        });
    }, [api]);

    // Auto-rotation with pause capability
    useEffect(() => {
        // Clear previous interval if it exists
        if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // Only set interval if we have more than one item and not paused
        if (items.length > 1 && !isPaused && api) {
            intervalRef.current = window.setInterval(() => {
                api.scrollNext();
            }, autoRotateInterval);
        }

        return () => {
            if (intervalRef.current) {
                window.clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [items.length, isPaused, api, autoRotateInterval]);

    // Early return if no items available
    if (items.length === 0) return null;

    return (
        <Card className="max-w-4xl mx-auto my-8" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
            <CardContent className="p-1 sm:p-6">
                <ShadcnCarousel 
                    setApi={setApi}
                    className="w-full"
                    opts={{
                        loop: true,
                        align: "center",
                    }}
                    aria-label={`${itemsType} Carousel`}
                >
                    <CarouselContent>
                        {items.map((item) => (
                            <CarouselItem key={item.id} className="basis-full md:basis-full lg:basis-full">
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
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    
                    <CarouselPrevious className="left-2 sm:left-4" />
                    <CarouselNext className="right-2 sm:right-4" />
                </ShadcnCarousel>
                
                {/* Custom indicators */}
                <div className="flex justify-center gap-2 mt-4 pb-2">
                    {items.map((_, index) => (
                        <button
                            key={index}
                            className={cn(
                                "h-2 rounded-full transition-all duration-300",
                                index === current ? "w-12 bg-primary" : "w-8 bg-neutral-600 hover:bg-neutral-500"
                            )}
                            onClick={() => api?.scrollTo(index)}
                            aria-label={`Go to slide ${index + 1}`}
                            aria-current={index === current ? 'true' : 'false'}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default Carousel;
