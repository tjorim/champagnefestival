import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { Alert, AlertHeading, AlertLink } from "@/components/ui/alert";
import { Badge, toBadgeVariant } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

vi.mock("@/paraglide/messages", () => ({ m: { close: () => "Close" } }));

describe("Alert", () => {
  it("is an assertive live region by default and exposes its variant", () => {
    render(<Alert variant="danger">Saving failed</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Saving failed");
    expect(alert).toHaveAttribute("data-slot", "alert");
    expect(alert).toHaveAttribute("data-variant", "danger");
    expect(alert).not.toHaveAttribute("aria-live");
    expect(alert.className).not.toMatch(/(^|\s)alert(-|\s|$)/);
  });

  it("lets callers pick a polite status region without a second live region", () => {
    render(<Alert role="status">Saved</Alert>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saved");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a labelled dismiss button only when onClose is given", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Alert>No dismiss</Alert>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<Alert onClose={onClose}>Dismissable</Alert>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Alert onClose={onClose} closeLabel="Dismiss error">
        Custom label
      </Alert>,
    );
    expect(screen.getByRole("button", { name: "Dismiss error" })).toBeInTheDocument();
  });

  it("supports a heading level and an in-alert link without axe violations", async () => {
    const { container } = render(
      <Alert variant="warning">
        <AlertHeading as="h3">Heads up</AlertHeading>
        <AlertLink href="/me">View my registrations</AlertLink>
      </Alert>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Heads up" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View my registrations" })).toHaveAttribute(
      "href",
      "/me",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Badge", () => {
  it("carries its text and variant hooks, never color alone", () => {
    render(
      <>
        <Badge variant="success">Checked in</Badge>
        <Badge>Not checked in</Badge>
      </>,
    );
    const done = screen.getByText("Checked in");
    expect(done).toHaveAttribute("data-slot", "badge");
    expect(done).toHaveAttribute("data-variant", "success");
    expect(screen.getByText("Not checked in")).toHaveAttribute("data-variant", "secondary");
    expect(done.className).not.toMatch(/(^|\s)(badge|bg-[a-z]+)(\s|$)/);
  });

  it("narrows dynamic tone strings to a known variant", () => {
    expect(toBadgeVariant("warning")).toBe("warning");
    expect(toBadgeVariant("unknown")).toBe("secondary");
    expect(toBadgeVariant("unknown", "info")).toBe("info");
  });
});

describe("Spinner", () => {
  it("is decorative by default", () => {
    const { container } = render(<Spinner size="sm" />);
    const spinner = container.querySelector('[data-slot="spinner"]');
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner).toHaveAttribute("data-size", "sm");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("announces a stand-alone label once through a status role", () => {
    render(<Spinner label="Loading…" variant="warning" />);
    const status = screen.getByRole("status");
    expect(status).not.toHaveAttribute("aria-hidden");
    expect(status.querySelector(".tw\\:sr-only")).toHaveTextContent("Loading…");
  });

  it("keeps caller-provided status semantics and honors reduced motion", () => {
    render(
      <Spinner role="status">
        <span className="tw:sr-only">Busy</span>
      </Spinner>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Busy");
    expect(status).not.toHaveAttribute("aria-hidden");
    expect(status.className).toContain("tw:animate-spin");
    expect(status.className).toContain("tw:motion-reduce:animate-spinner-slow");
  });
});
