import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MarqueeSlider from '../components/MarqueeSlider';

vi.mock('swiper/react', () => ({
  Swiper: ({ children }: { children: React.ReactNode }) => <div data-testid="swiper">{children}</div>,
  SwiperSlide: ({ children }: { children: React.ReactNode }) => <div data-testid="swiper-slide">{children}</div>,
}));

vi.mock('swiper/modules', () => ({
  Autoplay: {},
  Navigation: {},
  Pagination: {},
}));

vi.mock('swiper/css', () => ({}));
vi.mock('swiper/css/autoplay', () => ({}));
vi.mock('swiper/css/navigation', () => ({}));
vi.mock('swiper/css/pagination', () => ({}));

describe('MarqueeSlider component', () => {
  it('renders the Swiper container', () => {
    render(<MarqueeSlider />);
    expect(screen.getByTestId('swiper')).toBeInTheDocument();
  });

  it('renders default items when no items prop provided', () => {
    render(<MarqueeSlider />);
    // Default items include "Champagne Tasting" - may be duplicated, use getAllByText
    expect(screen.getAllByText('Champagne Tasting').length).toBeGreaterThan(0);
  });

  it('renders provided items', () => {
    const items = [
      { id: 1, name: 'Maison A', image: '/images/a.jpg' },
      { id: 2, name: 'Maison B', image: '/images/b.jpg' },
    ];
    render(<MarqueeSlider items={items} />);
    expect(screen.getAllByText('Maison A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maison B').length).toBeGreaterThan(0);
  });

  it('duplicates items to fill minimum slide count', () => {
    const items = [{ id: 1, name: 'Single Item', image: '/images/a.jpg' }];
    render(<MarqueeSlider items={items} />);
    // Item is duplicated to have at least 8 slides
    const slides = screen.getAllByTestId('swiper-slide');
    expect(slides.length).toBe(8);
  });

  it('renders images with alt text', () => {
    const items = [
      { id: 1, name: 'Maison A', image: '/images/a.jpg' },
    ];
    render(<MarqueeSlider items={items} />);
    const images = screen.getAllByAltText('Maison A');
    expect(images.length).toBeGreaterThan(0);
  });
});
