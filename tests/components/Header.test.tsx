import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Header from '@/components/Header';

vi.mock('@/paraglide/messages', () => ({
  m: {
    festival_name: () => 'Champagne Festival',
    language_select: () => 'Select language',
  },
}));

vi.mock('@/paraglide/runtime', () => ({
  getLocale: vi.fn().mockReturnValue('nl'),
  setLocale: vi.fn(),
  isLocale: vi.fn().mockReturnValue(true),
}));

vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}));

describe('Header component', () => {
  it('renders the festival name', () => {
    render(<Header />);
    expect(screen.getByText('Champagne Festival')).toBeInTheDocument();
  });

  it('renders the logo image', () => {
    render(<Header />);
    const logo = screen.getByAltText('Champagne Festival logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', '/images/logo.svg');
  });

  it('accepts a custom logoSrc prop', () => {
    render(<Header logoSrc="/images/custom-logo.png" />);
    expect(screen.getByAltText('Champagne Festival logo')).toHaveAttribute('src', '/images/custom-logo.png');
  });

  it('renders the language switcher', () => {
    render(<Header />);
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('logo links to #welcome', () => {
    render(<Header />);
    const brand = screen.getByText('Champagne Festival').closest('a');
    expect(brand).toHaveAttribute('href', '#welcome');
  });
});
