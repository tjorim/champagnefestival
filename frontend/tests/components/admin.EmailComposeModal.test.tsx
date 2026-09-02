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
});
