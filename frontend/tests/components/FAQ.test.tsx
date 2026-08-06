import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, it, expect } from "vitest";
import FAQ from "@/components/FAQ";
import { server } from "@/mocks/server";

const ITEMS = [
  {
    id: "faq-1",
    question: "What is the Champagnefestival?",
    answer: "An annual celebration of champagne.",
    sort_order: 0,
    active: true,
  },
  {
    id: "faq-2",
    question: "When does it take place?",
    answer: "First full weekend of October.",
    sort_order: 1,
    active: true,
  },
];

function renderFaq(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <FAQ />
    </QueryClientProvider>,
  );
}

describe("FAQ component", () => {
  it("renders active FAQ items from the API", async () => {
    server.use(http.get("/api/faq/active", () => HttpResponse.json(ITEMS)));

    renderFaq();

    expect(await screen.findByText("What is the Champagnefestival?")).toBeInTheDocument();
    expect(screen.getByText("When does it take place?")).toBeInTheDocument();
    expect(screen.getByText("An annual celebration of champagne.")).toBeInTheDocument();
  });

  it("renders an Accordion item per FAQ entry", async () => {
    server.use(http.get("/api/faq/active", () => HttpResponse.json(ITEMS)));

    renderFaq();

    const buttons = await screen.findAllByRole("button");
    expect(buttons.length).toBe(ITEMS.length);
  });

  it("shows an empty state when there are no FAQ items", async () => {
    server.use(http.get("/api/faq/active", () => HttpResponse.json([])));

    renderFaq();

    expect(await screen.findByText(/no frequently asked questions/i)).toBeInTheDocument();
  });

  it("shows an error state instead of the empty state when the request fails", async () => {
    server.use(http.get("/api/faq/active", () => HttpResponse.json(null, { status: 500 })));

    renderFaq();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/no frequently asked questions/i)).not.toBeInTheDocument();
  });
});
