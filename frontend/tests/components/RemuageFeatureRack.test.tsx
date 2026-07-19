import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RemuageFeatureRack from "@/components/remuage/RemuageFeatureRack";

const ITEMS = [
  { id: "producer", title: "Cuvée", description: "Rencontrez les producteurs.", iconClass: "bi bi-cup" },
  { id: 7, title: "Dégustation", description: "Explorez les styles 🥂", iconClass: "bi bi-stars" },
  { id: "community", title: "Community", description: "Share the festival.", iconClass: "bi bi-people" },
];

describe("RemuageFeatureRack", () => {
  it("renders semantic feature articles without sequence numbers", () => {
    const { container } = render(<RemuageFeatureRack items={ITEMS} />);
    const articles = container.querySelectorAll("article");

    expect(articles).toHaveLength(ITEMS.length);
    ITEMS.forEach((item, index) => {
      const article = articles.item(index);
      expect(within(article).getByRole("heading", { name: item.title })).toBeInTheDocument();
      expect(within(article).getByText(item.description)).toBeInTheDocument();
      expect(article.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    });
    expect(screen.queryByText("01")).not.toBeInTheDocument();
    expect(screen.queryByText("02")).not.toBeInTheDocument();
    expect(screen.queryByText("03")).not.toBeInTheDocument();
  });

  it("renders an empty rack for an empty feature list", () => {
    const { container } = render(<RemuageFeatureRack items={[]} />);

    expect(container.querySelector(".remuage-feature-rack")).toBeInTheDocument();
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });
});
