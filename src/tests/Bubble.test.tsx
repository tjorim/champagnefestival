import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Bubble from '../components/Bubble';

describe('Bubble component', () => {
  it('renders with correct CSS variables from props', () => {
    render(
      <Bubble 
        size={20} 
        duration={5} 
        delay={2} 
        left={50} 
      />
    );
    
    // Using container query since this is a div without a role
    // aria-hidden elements aren't exposed via screen queries by default
    const bubbleDiv = document.querySelector('.bubble') as HTMLElement;
    expect(bubbleDiv).toHaveClass('bubble');
    expect(bubbleDiv).toHaveAttribute('aria-hidden', 'true');
    
    // Check CSS custom properties set on the element
    expect(bubbleDiv.style.getPropertyValue('--bubble-size')).toBe('20px');
    expect(bubbleDiv.style.getPropertyValue('--bubble-duration')).toBe('5s');
    expect(bubbleDiv.style.getPropertyValue('--bubble-delay')).toBe('2s');
    expect(bubbleDiv.style.getPropertyValue('--bubble-left')).toBe('50%');
  });
  
  it('handles edge case values appropriately', () => {
    render(
      <Bubble 
        size={0} 
        duration={0.1} 
        delay={0} 
        left={100} 
      />
    );
    
    const bubbleDiv = document.querySelector('.bubble') as HTMLElement;
    expect(bubbleDiv.style.getPropertyValue('--bubble-size')).toBe('0px');
    expect(bubbleDiv.style.getPropertyValue('--bubble-duration')).toBe('0.1s');
    expect(bubbleDiv.style.getPropertyValue('--bubble-delay')).toBe('0s');
    expect(bubbleDiv.style.getPropertyValue('--bubble-left')).toBe('100%');
  });
});