import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LanguageSwitcher from '@/components/LanguageSwitcher';

vi.mock('@/paraglide/runtime', () => ({
  getLocale: vi.fn().mockReturnValue('nl'),
  setLocale: vi.fn(),
  isLocale: vi.fn().mockReturnValue(true),
}));

vi.mock('@/paraglide/messages', () => ({
  m: {
    language_select: () => 'Select language',
  },
}));

describe('LanguageSwitcher component', () => {
  it('renders after hydration', async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: /language selection/i })).toBeInTheDocument();
  });

  it('shows current language code in toggle', async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    expect(screen.getByText('NL')).toBeInTheDocument();
  });

  it('shows all three language options in dropdown', async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /language selection/i }));
    // English appears twice: once as the language label, once as the native name
    expect(screen.getAllByText('English')).toHaveLength(2);
    expect(screen.getByText('Nederlands')).toBeInTheDocument();
    expect(screen.getByText('Français')).toBeInTheDocument();
  });

  it('calls setLocale when a language is selected', async () => {
    const { setLocale } = await import('@/paraglide/runtime');
    render(<LanguageSwitcher />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /language selection/i }));
    // Click French option (nativeName 'Français' is unique)
    fireEvent.click(screen.getByText('Français').closest('button')!);
    expect(setLocale).toHaveBeenCalledWith('fr');
  });

  it('shows a checkmark for the active language', async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /language selection/i }));
    // The active language (nl) should have the highlighted class
    const dutchItem = screen.getByText('Nederlands').closest('button');
    expect(dutchItem).toHaveClass('bg-primary');
  });
});
