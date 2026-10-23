import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LazyRegistrationModal from "./LazyRegistrationModal";

const loaded = vi.hoisted(() => vi.fn());

vi.mock("@/components/RegistrationModal", () => {
  loaded();
  return {
    default: ({ show }: { show: boolean }) => (
      <div data-testid="modal">{show ? "open" : "closed"}</div>
    ),
  };
});

describe("LazyRegistrationModal", () => {
  it("loads the modal when first shown and keeps it mounted after closing", async () => {
    const onHide = vi.fn();
    const view = render(<LazyRegistrationModal show={false} onHide={onHide} event={null} />);
    expect(loaded).not.toHaveBeenCalled();
    expect(screen.queryByTestId("modal")).not.toBeInTheDocument();

    view.rerender(<LazyRegistrationModal show onHide={onHide} event={null} />);
    expect(await screen.findByTestId("modal")).toHaveTextContent("open");
    expect(loaded).toHaveBeenCalledOnce();

    view.rerender(<LazyRegistrationModal show={false} onHide={onHide} event={null} />);
    expect(screen.getByTestId("modal")).toHaveTextContent("closed");
  });
});
