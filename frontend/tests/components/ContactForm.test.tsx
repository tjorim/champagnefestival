import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { server } from "@/mocks/server";
import ContactForm from "@/components/ContactForm";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    contact_name: () => "Name",
    contact_email: () => "Email",
    contact_message: () => "Message",
    contact_placeholder_name: () => "John Doe",
    contact_placeholder_email: () => "email@example.com",
    contact_placeholder_message: () => "Type your message...",
    contact_submit: () => "Send",
    contact_submitting: () => "Sending...",
    contact_success_message: () => "Message sent successfully!",
    contact_errors_name_required: () => "Name is required",
    contact_errors_email_required: () => "Email is required",
    contact_errors_email_invalid: () => "Email is invalid",
    contact_errors_message_required: () => "Message is required",
    contact_network_error: () => "Network error",
    contact_submission_error: () => "Submission error",
  },
}));

/** Answers POST /api/contact and returns what the form sent, in order. */
function serveContact(respond: () => Response | Promise<Response>) {
  const sent: { request: Request; body: Record<string, unknown> }[] = [];
  server.use(
    http.post("/api/contact", async ({ request }) => {
      sent.push({ request, body: (await request.clone().json()) as Record<string, unknown> });
      return respond();
    }),
  );
  return sent;
}

describe("ContactForm component", () => {
  function renderForm() {
    const wrapper = createTestQueryClientWrapper();
    return render(<ContactForm />, { wrapper });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders form fields and submit button", () => {
    renderForm();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("shows validation errors when submitting empty form", async () => {
    renderForm();
    fireEvent.submit(screen.getByRole("button", { name: /send/i }).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      expect(screen.getByText("Message is required")).toBeInTheDocument();
    });
  });

  it("shows email validation error for invalid email", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: "name", value: "John" } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { name: "email", value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { name: "message", value: "Hello" },
    });
    fireEvent.submit(screen.getByLabelText(/name/i).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Email is invalid")).toBeInTheDocument();
    });
  });

  it("clears field error when user starts typing", async () => {
    renderForm();
    fireEvent.submit(screen.getByLabelText(/name/i).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: "name", value: "J" } });
    await waitFor(() => {
      expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
    });
  });

  it("shows success message after successful submission", async () => {
    const sent = serveContact(() => HttpResponse.json({ message: "success" }));
    renderForm();
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { name: "name", value: "John Doe" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { name: "email", value: "john@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { name: "message", value: "Hello there" },
    });
    fireEvent.submit(screen.getByLabelText(/name/i).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Message sent successfully!")).toBeInTheDocument();
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.request.headers.get("content-type")).toBe("application/json");
    expect(sent[0]!.body).toMatchObject({
      submission_id: expect.any(String),
      name: "John Doe",
      email: "john@example.com",
      message: "Hello there",
    });
  });

  it("shows error message when submission fails", async () => {
    const sent = serveContact(() => HttpResponse.json({ detail: "Server error" }, { status: 500 }));
    renderForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: "name", value: "John" } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { name: "email", value: "john@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { name: "message", value: "Hello" },
    });
    fireEvent.submit(screen.getByLabelText(/name/i).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.request.headers.get("content-type")).toBe("application/json");
    expect(sent[0]!.body).toMatchObject({
      submission_id: expect.any(String),
      name: "John",
      email: "john@example.com",
      message: "Hello",
    });
  });

  it("shows a FastAPI validation message when detail is an array", async () => {
    serveContact(() =>
      HttpResponse.json(
        { detail: [{ loc: ["body", "email"], msg: "Invalid email" }] },
        { status: 422 },
      ),
    );
    renderForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: "name", value: "John" } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { name: "email", value: "john@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { name: "message", value: "Hello" },
    });
    fireEvent.submit(screen.getByLabelText(/name/i).closest("form")!);
    await waitFor(() => expect(screen.getByText("Invalid email")).toBeInTheDocument());
  });

  it("falls back when FastAPI detail is not textual", async () => {
    serveContact(() => HttpResponse.json({ detail: { reason: "bad" } }, { status: 400 }));
    renderForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: "name", value: "John" } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { name: "email", value: "john@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { name: "message", value: "Hello" },
    });
    fireEvent.submit(screen.getByLabelText(/name/i).closest("form")!);
    await waitFor(() => expect(screen.getByText("Submission error")).toBeInTheDocument());
  });

  it("shows spinner while submitting", async () => {
    let resolvePromise: (value: Response) => void = () => {};
    serveContact(
      () =>
        new Promise<Response>((resolve) => {
          resolvePromise = resolve;
        }),
    );
    renderForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { name: "name", value: "John" } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { name: "email", value: "john@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { name: "message", value: "Hello" },
    });
    fireEvent.submit(screen.getByLabelText(/name/i).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Sending...")).toBeInTheDocument();
    });
    resolvePromise(HttpResponse.json({}));

    await waitFor(() => {
      expect(screen.queryByText("Sending...")).toBeNull();
    });
  });
});
