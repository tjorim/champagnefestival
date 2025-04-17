/**
 * Configuration for MarqueeSlider items
 */

// Type for slider items
export interface SliderItem {
  id: number;
  name: string;
  image: string;
}

// Define items for producers and sponsors
export const producerItems: SliderItem[] = [
  {
    id: 1,
    name: "Producer 1",
    image: "/images/producers/producer1.jpg" // Note: actual fallback is handled in components via onError, using fallbackImage
  },
  {
    id: 2,
    name: "Producer 2",
    image: "/images/producers/producer2.jpg"
  },
  {
    id: 3,
    name: "Producer 3",
    image: "/images/producers/producer3.jpg"
  },
];

export const sponsorItems: SliderItem[] = [
  {
    id: 1,
    name: "Sponsor 1",
    image: "/images/sponsors/sponsor1.jpg"
  },
  {
    id: 2,
    name: "Sponsor 2",
    image: "/images/sponsors/sponsor2.jpg"
  },
  {
    id: 3,
    name: "Sponsor 3",
    image: "/images/sponsors/sponsor3.jpg"
  },
];

// Fallback image if the specified image fails to load
export const fallbackImage = "/images/logo.svg";
