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

const chartExport = vi.hoisted(() => ({
  downloadAttendanceChartSvg: vi.fn(),
  downloadAttendanceChartPng: vi.fn(),
}));

vi.mock("@/components/admin/analyticsChartExport", () => chartExport);

const edition = {
  editionId: "edition-2026",
  year: 2026,
  month: "march",
  editionType: "festival",
  startDate: "2026-03-20",
  eventsCount: 2,
  totalRegistrations: 10,
  totalGuests: 25,
  totalCheckedIn: 18,
  totalPaid: 500,
  totalDue: 600,
  totalReceived: 500,
  totalRefunded: 0,
  totalOutstanding: 100,
  totalRefundLiability: 0,
};

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
    chartExport.downloadAttendanceChartSvg.mockReset();
    chartExport.downloadAttendanceChartPng.mockReset();
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
        totalPaid: 500,
        totalDue: 600,
        totalReceived: 500,
        totalRefunded: 0,
        totalOutstanding: 100,
        totalRefundLiability: 0,
      },
    ]);
    renderAnalyticsDashboard();

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "admin_analytics_chart_aria" })).toBeInTheDocument(),
    );
    expect(screen.getByText("admin_analytics_legend_guests")).toBeInTheDocument();
    expect(screen.getByText("admin_analytics_legend_checked_in")).toBeInTheDocument();
  });

  it("hides a series' bars when its legend item is toggled off", async () => {
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
        totalPaid: 500,
        totalDue: 600,
        totalReceived: 500,
        totalRefunded: 0,
        totalOutstanding: 100,
        totalRefundLiability: 0,
      },
    ]);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AnalyticsDashboard authHeaders={() => ({})} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "admin_analytics_chart_aria" })).toBeInTheDocument(),
    );

    const attendanceChart = screen.getByRole("img", { name: "admin_analytics_chart_aria" });
    const barPaths = () => attendanceChart.querySelectorAll("g.ts-chart__bar-y path");
    await waitFor(() => expect(barPaths()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /guests/i }));

    await waitFor(() => expect(barPaths()).toHaveLength(1));
    expect(
      attendanceChart.querySelector('g.ts-chart__bar-y path[data-ts-key*=":guests:"]'),
    ).not.toBeInTheDocument();
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
        totalPaid: 500,
        totalDue: 600,
        totalReceived: 500,
        totalRefunded: 0,
        totalOutstanding: 100,
        totalRefundLiability: 0,
      },
    ]);
    renderAnalyticsDashboard();

    await waitFor(() => expect(screen.getByText("admin_analytics_view_table")).toBeInTheDocument());
    fireEvent.click(screen.getByText("admin_analytics_view_table"));

    expect(await screen.findByRole("cell", { name: "18" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "72%" })).toBeInTheDocument();
  });

  it("describes both charts for assistive technology", async () => {
    fetchEditionStats.mockResolvedValue([
      edition,
      { ...edition, editionId: "edition-2027", year: 2027, totalGuests: 0, totalCheckedIn: 0 },
    ]);
    renderAnalyticsDashboard();

    const attendance = await screen.findByRole("img", { name: "admin_analytics_chart_aria" });
    expect(attendance.querySelector("desc")).toHaveTextContent("admin_analytics_chart_description");

    const rate = screen.getByRole("img", { name: "admin_analytics_checkin_rate_aria" });
    expect(rate.querySelector("desc")).toHaveTextContent(
      "admin_analytics_checkin_rate_description",
    );
    expect(
      screen.getByRole("heading", { name: "admin_analytics_checkin_rate_title" }),
    ).toBeInTheDocument();
    // The edition without registered guests has no rate to plot.
    expect(rate.querySelectorAll("g.ts-chart__bar-y path")).toHaveLength(1);
  });

  it("hides the rate chart when no edition has registered guests", async () => {
    fetchEditionStats.mockResolvedValue([{ ...edition, totalGuests: 0, totalCheckedIn: 0 }]);
    renderAnalyticsDashboard();

    await screen.findByRole("img", { name: "admin_analytics_chart_aria" });
    expect(
      screen.queryByRole("img", { name: "admin_analytics_checkin_rate_aria" }),
    ).not.toBeInTheDocument();
  });

  it("exports the attendance chart with the currently visible legend", async () => {
    fetchEditionStats.mockResolvedValue([edition]);
    renderAnalyticsDashboard();
    await screen.findByRole("img", { name: "admin_analytics_chart_aria" });

    const base = { target: expect.any(HTMLElement), background: "#1e1e1e" };
    const both = [
      { label: "admin_analytics_legend_guests", colorVar: "--ts-chart-1" },
      { label: "admin_analytics_legend_checked_in", colorVar: "--ts-chart-2" },
    ];

    fireEvent.click(screen.getByRole("button", { name: "admin_analytics_export_chart_svg" }));
    await waitFor(() =>
      expect(chartExport.downloadAttendanceChartSvg).toHaveBeenCalledWith({
        ...base,
        filename: "attendance-chart.svg",
        legend: both,
      }),
    );

    // Toggling a series off removes it from the exported legend too.
    fireEvent.click(screen.getByRole("button", { name: /legend_guests/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /legend_guests/ })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "admin_analytics_export_chart_png" }));
    await waitFor(() =>
      expect(chartExport.downloadAttendanceChartPng).toHaveBeenCalledWith({
        ...base,
        filename: "attendance-chart.png",
        legend: [both[1]],
      }),
    );
  });

  it("reports a failed chart export", async () => {
    chartExport.downloadAttendanceChartSvg.mockImplementation(() => {
      throw new Error("boom");
    });
    fetchEditionStats.mockResolvedValue([edition]);
    renderAnalyticsDashboard();
    await screen.findByRole("img", { name: "admin_analytics_chart_aria" });

    fireEvent.click(screen.getByRole("button", { name: "admin_analytics_export_chart_svg" }));

    expect(await screen.findByText("admin_analytics_export_chart_error")).toBeInTheDocument();
  });

  it("hides chart exports and the rate chart in table view", async () => {
    fetchEditionStats.mockResolvedValue([edition]);
    renderAnalyticsDashboard();
    await screen.findByRole("img", { name: "admin_analytics_chart_aria" });

    fireEvent.click(screen.getByText("admin_analytics_view_table"));

    expect(
      screen.queryByRole("button", { name: "admin_analytics_export_chart_svg" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "admin_analytics_checkin_rate_title" }),
    ).not.toBeInTheDocument();
  });
});
