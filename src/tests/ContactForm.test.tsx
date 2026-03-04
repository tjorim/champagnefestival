import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContactForm from '../components/ContactForm';

vi.mock('../paraglide/messages', () => ({
  m: {
    contact_name: () => 'Name',
    contact_email: () => 'Email',
    contact_message: () => 'Message',
    contact_placeholder_message: () => 'Type your message...',
    contact_submit: () => 'Send',
    contact_submitting: () => 'Sending...',
    contact_success_message: () => 'Message sent successfully!',
    contact_errors_name_required: () => 'Name is required',
    contact_errors_email_required: () => 'Email is required',
    contact_errors_email_invalid: () => 'Email is invalid',
    contact_errors_message_required: () => 'Message is required',
    contact_network_error: () => 'Network error',
    contact_submission_error: () => 'Submission error',
  },
}));

describe('ContactForm component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders form fields and submit button', () => {
    render(<ContactForm />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    render(<ContactForm />);
    fireEvent.submit(screen.getByRole('button', { name: /send/i }).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Message is required')).toBeInTheDocument();
    });
  });

  it('shows email validation error for invalid email', async () => {
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: 'name', value: 'John' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { name: 'email', value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { name: 'message', value: 'Hello' } });
    fireEvent.submit(screen.getByLabelText(/name/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('Email is invalid')).toBeInTheDocument();
    });
  });

  it('clears field error when user starts typing', async () => {
    render(<ContactForm />);
    fireEvent.submit(screen.getByLabelText(/name/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: 'name', value: 'J' } });
    await waitFor(() => {
      expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
    });
  });

  it('shows success message after successful submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'success' }),
    }));
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: 'name', value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { name: 'email', value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { name: 'message', value: 'Hello there' } });
    fireEvent.submit(screen.getByLabelText(/name/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('Message sent successfully!')).toBeInTheDocument();
    });
  });

  it('shows error message when submission fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Server error' }),
    }));
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: 'name', value: 'John' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { name: 'email', value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { name: 'message', value: 'Hello' } });
    fireEvent.submit(screen.getByLabelText(/name/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('Submission error')).toBeInTheDocument();
    });
  });

  it('shows spinner while submitting', async () => {
    let resolvePromise: (value: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve; })
    ));
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: 'name', value: 'John' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { name: 'email', value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { name: 'message', value: 'Hello' } });
    fireEvent.submit(screen.getByLabelText(/name/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument();
    });
    resolvePromise!({ ok: true, json: async () => ({}) });
  });
});
