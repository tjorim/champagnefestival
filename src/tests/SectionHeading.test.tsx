import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SectionHeading from '../components/SectionHeading';

describe('SectionHeading component', () => {
  it('renders the heading with the provided title', () => {
    render(<SectionHeading id="test-heading" title="Test Heading" />);
    expect(screen.getByText('Test Heading')).toBeInTheDocument();
  });

  it('applies the provided className', () => {
    render(<SectionHeading id="test-heading" title="Test Heading" className="custom-class" />);
    const container = screen.getByText('Test Heading').closest('div');
    expect(container).toHaveClass('custom-class');
  });

  it('renders with subtitle when provided', () => {
    render(
      <SectionHeading 
        id="test-heading" 
        title="Test Heading" 
        subtitle="This is a subtitle" 
      />
    );
    expect(screen.getByText('Test Heading')).toBeInTheDocument();
    expect(screen.getByText('This is a subtitle')).toBeInTheDocument();
  });
});