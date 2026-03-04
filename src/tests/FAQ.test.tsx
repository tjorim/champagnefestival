import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FAQ from '../components/FAQ';

vi.mock('../paraglide/messages', () => ({
  m: {
    faq_q1: () => 'What is the Champagne Festival?',
    faq_a1: () => 'An annual celebration of champagne.',
    faq_q2: () => 'When does it take place?',
    faq_a2: () => 'First full weekend of October.',
    faq_q3: () => 'Where is it held?',
    faq_a3: () => 'At the event center.',
    faq_q4: () => 'How much does it cost?',
    faq_a4: () => 'Entry is free.',
    faq_q5: () => 'Is reservation required?',
    faq_a5: () => 'Only for VIP events.',
  },
}));

describe('FAQ component', () => {
  it('renders all 5 FAQ items by default', () => {
    render(<FAQ />);
    expect(screen.getByText('What is the Champagne Festival?')).toBeInTheDocument();
    expect(screen.getByText('When does it take place?')).toBeInTheDocument();
    expect(screen.getByText('Where is it held?')).toBeInTheDocument();
    expect(screen.getByText('How much does it cost?')).toBeInTheDocument();
    expect(screen.getByText('Is reservation required?')).toBeInTheDocument();
  });

  it('renders only specified FAQ ids when ids prop provided', () => {
    render(<FAQ ids={[1, 3]} />);
    expect(screen.getByText('What is the Champagne Festival?')).toBeInTheDocument();
    expect(screen.getByText('Where is it held?')).toBeInTheDocument();
    expect(screen.queryByText('When does it take place?')).not.toBeInTheDocument();
  });

  it('renders an Accordion component', () => {
    render(<FAQ />);
    // Accordion items have buttons as headers
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('renders answers in the FAQ body', () => {
    render(<FAQ />);
    expect(screen.getByText('An annual celebration of champagne.')).toBeInTheDocument();
  });
});
