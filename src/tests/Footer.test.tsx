import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Footer from '../components/Footer';

vi.mock('../paraglide/messages', () => ({
  m: {
    festival_name: () => 'Champagne Festival',
    footer_rights: () => 'All rights reserved.',
  },
}));

// Mock the PrivacyPolicy component since we're only testing the Footer
vi.mock('../components/PrivacyPolicy', () => ({
  default: function MockPrivacyPolicy() {
    return (
      <button data-testid="privacy-button">Privacy Policy</button>
    );
  }
}));

describe('Footer component', () => {
  it('renders footer with copyright text', () => {
    render(<Footer />);

    // Check that the copyright text includes the current year
    const currentYear = new Date().getFullYear().toString();
    const footer = screen.getByRole('contentinfo');

    expect(footer).toHaveTextContent(`© ${currentYear} Champagne Festival. All rights reserved.`);
  });

  it('renders privacy policy button', () => {
    render(<Footer />);

    // Check that the privacy policy button is rendered
    expect(screen.getByTestId('privacy-button')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });
});
