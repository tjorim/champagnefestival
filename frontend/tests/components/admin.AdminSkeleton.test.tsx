import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminSkeleton, { skeletonVariantForSection } from "@/components/admin/AdminSkeleton";

vi.mock("@/paraglide/messages", () => ({
  m: { admin_loading: () => "Loading…" },
}));

describe("skeletonVariantForSection", () => {
  it("uses the row layout for list sections", () => {
    for (const key of ["registrations", "directory", "members", "volunteers", "audit-log"]) {
      expect(skeletonVariantForSection(key)).toBe("table");
    }
  });

  it("falls back to the card layout for everything else", () => {
    for (const key of ["venues", "floor-plans", "analytics", "unknown-section"]) {
      expect(skeletonVariantForSection(key)).toBe("panel");
    }
  });
});

describe("AdminSkeleton", () => {
  it("announces loading once rather than per placeholder bar", () => {
    render(<AdminSkeleton variant="table" rows={6} />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    // The bars are decorative; a screen reader should hear a single message.
    expect(screen.getAllByText("Loading…")).toHaveLength(1);
  });

  it("renders the requested number of rows", () => {
    const { container } = render(<AdminSkeleton variant="table" rows={4} />);

    expect(container.querySelectorAll(".admin-skeleton-row")).toHaveLength(4);
  });

  it("caps cards so the panel layout does not overflow the viewport", () => {
    const { container } = render(<AdminSkeleton variant="panel" rows={12} />);

    expect(container.querySelectorAll(".admin-skeleton-card")).toHaveLength(4);
  });
});
