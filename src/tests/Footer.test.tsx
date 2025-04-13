import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Footer from '../components/Footer';

// Mock the PrivacyPolicy component since we're only testing the Footer
vi.mock('../components/PrivacyPolicy', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => 
    isOpen ? <div data-testid="privacy-modal" onClick={onClose}>Mock Privacy Policy</div> : null
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      // Handle fallback strings or objects with defaultValue
      if (typeof options === 'string') return options;
      if (options?.defaultValue) return options.defaultValue;
      return key;
    }
  })
}));

describe('Footer component', () => {
  it('renders footer with copyright text', () => {
    render(<Footer />);
    
    // Check that the copyright text includes the current year
    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(/Champagne Festival/)).toBeInTheDocument();
    expect(screen.getByText(/All rights reserved./)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
  });
  
  it('shows and closes privacy policy modal when clicked', async () => {
    // Mock setTimeout
    vi.useFakeTimers();
    
    render(<Footer />);
    
    // Initially, privacy policy should not be shown
    expect(screen.queryByTestId('privacy-modal')).not.toBeInTheDocument();
    
    // Click the privacy policy link within act
    const privacyLink = screen.getByText('Privacy Policy');
    
    // Using act for both the click and timer advancement in a single operation
    act(() => {
      fireEvent.click(privacyLink);
      // Advance timers to execute setTimeout callback
      vi.runAllTimers();
    });
    
    // Privacy policy modal should now be shown
    expect(screen.getByTestId('privacy-modal')).toBeInTheDocument();
    
    // Test closing the modal
    const modal = screen.getByTestId('privacy-modal');
    act(() => {
      fireEvent.click(modal);
    });
    
    // Modal should be closed
    expect(screen.queryByTestId('privacy-modal')).not.toBeInTheDocument();
    
    // Clean up
    vi.useRealTimers();
  });
});