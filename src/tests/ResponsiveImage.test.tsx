import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ResponsiveImage from '../components/ResponsiveImage';

describe('ResponsiveImage component', () => {
  it('renders an image with src and alt', () => {
    render(<ResponsiveImage src="/images/test.jpg" alt="Test image" />);
    const img = screen.getByRole('img', { name: 'Test image' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/test.jpg');
  });

  it('uses lazy loading by default', () => {
    render(<ResponsiveImage src="/images/test.jpg" alt="Test" />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
  });

  it('uses eager loading when priority is true', () => {
    render(<ResponsiveImage src="/images/test.jpg" alt="Test" priority />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'eager');
  });

  it('renders aspect ratio container when width and height are provided', () => {
    const { container } = render(
      <ResponsiveImage src="/images/test.jpg" alt="Test" width={400} height={300} />
    );
    const aspectDiv = container.querySelector('[style*="padding-bottom"]');
    expect(aspectDiv).toBeInTheDocument();
  });

  it('applies fill styles when fill prop is true', () => {
    const { container } = render(
      <ResponsiveImage src="/images/test.jpg" alt="Test" fill />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('100%');
    expect(wrapper.style.height).toBe('100%');
  });

  it('applies custom className', () => {
    const { container } = render(
      <ResponsiveImage src="/images/test.jpg" alt="Test" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('passes sizes attribute to img', () => {
    render(<ResponsiveImage src="/images/test.jpg" alt="Test" sizes="(max-width: 768px) 100vw, 50vw" />);
    expect(screen.getByRole('img')).toHaveAttribute('sizes', '(max-width: 768px) 100vw, 50vw');
  });
});
