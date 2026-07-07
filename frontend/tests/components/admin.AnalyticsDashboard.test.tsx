import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const { fetchEditionStats } = vi.hoisted(() => ({
  fetchEditionStats: vi.fn(),
}));

vi.mock("@/utils/adminFetch", () => ({
  fetchEditionStats,
}));

function renderAnalyticsDashboard() {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsDashboard authHeaders={() => ({})} />
    </QueryClientProvider>,
  );
}

describe("AnalyticsDashboard", () => {
  beforeEach(() => {
    fetchEditionStats.mockReset();
  });

  it("shows an empty-state message when there are no editions", async () => {
    fetchEditionStats.mockResolvedValue([]);
    renderAnalyticsDashboard();

    await waitFor(() => expect(screen.getByText("admin_analytics_no_data")).toBeInTheDocument());
  });

  it("renders a chart by default with a legend for both series", async () => {
    fetchEditionStats.mockResolvedValue([
      {
        editionId: "edition-2026",
        year: 2026,
        month: "march",
        editionType: "festival",
        startDate: "2026-03-20",
        eventsCount: 2,
        totalRegistrations: 10,
        totalGuests: 25,
        totalCheckedIn: 18,
      },
    ]);
    renderAnalyticsDashboard();

    await waitFor(() => expect(screen.getByRole("img", { name: "admin_analytics_chart_aria" })).toBeInTheDocument());
    expect(screen.getByText("admin_analytics_legend_guests")).toBeInTheDocument();
    expect(screen.getByText("admin_analytics_legend_checked_in")).toBeInTheDocument();
  });

  it("switches to a table view showing the same data", async () => {
    fetchEditionStats.mockResolvedValue([
      {
        editionId: "edition-2026",
        year: 2026,
        month: "march",
        editionType: "festival",
        startDate: "2026-03-20",
        eventsCount: 2,
        totalRegistrations: 10,
        totalGuests: 25,
        totalCheckedIn: 18,
      },
    ]);
    renderAnalyticsDashboard();

    await waitFor(() => expect(screen.getByText("admin_analytics_view_table")).toBeInTheDocument());
    fireEvent.click(screen.getByText("admin_analytics_view_table"));

    expect(await screen.findByRole("cell", { name: "18" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "72%" })).toBeInTheDocument();
  });
});
