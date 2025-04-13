import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Bubble from '../components/Bubble';

describe('Bubble component', () => {
  it('renders with correct CSS variables from props', () => {
    const { container } = render(
      <Bubble 
        size={20} 
        duration={5} 
        delay={2} 
        left={50} 
      />
    );
    
    const bubbleDiv = container.firstChild as HTMLElement;
    expect(bubbleDiv).toHaveClass('bubble');
    expect(bubbleDiv).toHaveAttribute('aria-hidden', 'true');
    
    const computedStyle = window.getComputedStyle(bubbleDiv);
    expect(bubbleDiv.style.getPropertyValue('--bubble-size')).toBe('20px');
    expect(bubbleDiv.style.getPropertyValue('--bubble-duration')).toBe('5s');
    expect(bubbleDiv.style.getPropertyValue('--bubble-delay')).toBe('2s');
    expect(bubbleDiv.style.getPropertyValue('--bubble-left')).toBe('50%');
  });
});