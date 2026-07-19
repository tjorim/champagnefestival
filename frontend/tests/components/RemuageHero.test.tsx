import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RemuageHero from "@/components/remuage/RemuageHero";

describe("RemuageHero", () => {
  it("renders translated content, destinations, and a decorative rack", () => {
    const { container } = render(
      <RemuageHero
        festivalName="Champagnefestival"
        title="Taste the next edition"
        subtitle="Meet producers and plan your visit."
        learnMoreLabel="Plan my visit"
        scheduleLabel="View schedule"
      />,
    );

    expect(container.querySelector("section#welcome")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Champagnefestival")).toBeInTheDocument();
    expect(screen.getByText("Taste the next edition")).toBeInTheDocument();
    expect(screen.getByText("Meet producers and plan your visit.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /plan my visit/i })).toHaveAttribute(
      "href",
      "#next-festival",
    );
    expect(screen.getByRole("link", { name: /view schedule/i })).toHaveAttribute(
      "href",
      "#schedule",
    );
    expect(container.querySelector(".remuage-hero__rack")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
