import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LocationInfo from '@/components/LocationInfo';

vi.mock('@/paraglide/messages', () => ({
  m: {
    location_address: () => 'Address',
    location_opening_hours: () => 'Opening Hours',
    location_opening_hours_value: () => 'Fri-Sun, 10:00-23:00',
  },
}));

describe('LocationInfo component', () => {
  it('renders the venue name', () => {
    render(<LocationInfo />);
    expect(screen.getByText('Meeting- en eventcentrum Staf Versluys')).toBeInTheDocument();
  });

  it('renders the address section heading', () => {
    render(<LocationInfo />);
    expect(screen.getByText('Address')).toBeInTheDocument();
  });

  it('renders the street address', () => {
    render(<LocationInfo />);
    expect(screen.getByText('Kapelstraat 76')).toBeInTheDocument();
  });

  it('renders the city and postal code', () => {
    render(<LocationInfo />);
    expect(screen.getByText(/Bredene/)).toBeInTheDocument();
    expect(screen.getByText(/8450/)).toBeInTheDocument();
  });

  it('renders opening hours', () => {
    render(<LocationInfo />);
    expect(screen.getByText('Opening Hours')).toBeInTheDocument();
    expect(screen.getByText('Fri-Sun, 10:00-23:00')).toBeInTheDocument();
  });
});
