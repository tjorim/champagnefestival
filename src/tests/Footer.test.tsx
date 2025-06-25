import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Footer from '../components/Footer';

// Mock the PrivacyPolicy component since we're only testing the Footer
vi.mock('../components/PrivacyPolicy', () => ({
  default: function MockPrivacyPolicy() {
    return (
      <button data-testid="privacy-button">Privacy Policy</button>
    );
  }
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      // Return the fallback if provided, otherwise return the key
      return fallback || key;
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

  it('renders privacy policy button', () => {
    render(<Footer />);

    // Check that the privacy policy button is rendered
    expect(screen.getByTestId('privacy-button')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });
});