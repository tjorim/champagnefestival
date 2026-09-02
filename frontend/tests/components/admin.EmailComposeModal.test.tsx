import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EmailComposeModal from "@/components/admin/EmailComposeModal";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({}, { get: (_target, key: string) => () => key }),
}));

describe("EmailComposeModal", () => {
  it("falls back to copying long content instead of rendering a mailto link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <EmailComposeModal
        draft={{ recipient: "guest@example.com", subject: "Subject", body: "x".repeat(2000) }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link", { name: "admin_email_open_client" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "admin_email_copy_text" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(screen.getByText("admin_email_copied")).toBeInTheDocument();
  });

  it("associates every preview label with its control", () => {
    render(
      <EmailComposeModal
        draft={{ recipient: "guest@example.com", subject: "Subject", body: "Message" }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("admin_email_to_label")).toHaveValue("guest@example.com");
    expect(screen.getByLabelText("admin_email_subject_label")).toHaveValue("Subject");
    expect(screen.getByLabelText("admin_email_body_label")).toHaveValue("Message");
  });

  it("shows manual-copy instructions when clipboard access is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(
      <EmailComposeModal
        draft={{ recipient: "guest@example.com", subject: "Subject", body: "x".repeat(2000) }}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "admin_email_copy_text" }));
    expect(await screen.findByText("admin_email_copy_failed")).toBeInTheDocument();
  });
});
