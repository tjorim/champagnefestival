import { DownloadIcon, FileSpreadsheetIcon, NotebookTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
/**
 * AnalyticsDashboard — cross-edition attendance/check-in trend view.
 *
 * A grouped bar chart (guests registered vs. checked in, per edition,
 * chronological) and a check-in rate chart, built with TanStack Charts.
 * A table view of the same data is always available alongside them.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type SortingState } from "@tanstack/react-table";
import {
  barY,
  defineChart,
  group,
  type ChartBarStateStyle,
  type ChartMarkState,
} from "@tanstack/charts";
import { controlledSignal } from "@tanstack/charts/interaction/signal";
import { interactiveColorLegend } from "@tanstack/charts/legend";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { m } from "@/paraglide/messages";
import {
  downloadPaymentTransactionsCsv,
  fetchEditionStats,
  fetchPaymentTransactionsLedger,
  LEDGER_PAGE_SIZE,
} from "@/utils/adminFetch";
import type { EditionAttendanceStats } from "@/types/admin";
import { queryKeys } from "@/utils/queryKeys";
import { devError } from "@/utils/devLog";
import LedgerModal, { LEDGER_SORT_KEY_BY_COLUMN } from "./LedgerModal";
import "./analyticsDashboard.css";

interface AnalyticsDashboardProps {
  authHeaders: () => Record<string, string>;
}

const CHART_HEIGHT = 260;

// Spring transition for bar height/position and tooltip movement as the
// underlying edition stats query resolves or refreshes.
const chartRenderer = motion({
  transition: { type: "spring", stiffness: 170, damping: 22, mass: 1 },
});

/**
 * Series order maps onto the validated `--ts-chart-1`/`--ts-chart-2` palette
 * slots (blue, aqua) set in analyticsDashboard.css, so the series colors
 * live with the rest of the chart theme.
 */
const ATTENDANCE_SERIES = ["guests", "checkedIn"] as const;

type AttendanceSeries = (typeof ATTENDANCE_SERIES)[number];

/** Surface behind the charts, used as the PNG export background. */
const CHART_EXPORT_BACKGROUND = "#1e1e1e";
const CHART_EXPORT_FILENAME = "attendance-chart";
const SERIES_COLOR_VARS: Record<AttendanceSeries, string> = {
  guests: "--ts-chart-1",
  checkedIn: "--ts-chart-2",
};

/** Dim every bar outside the series hovered or focused in the legend. */
const LEGEND_EMPHASIS_STATES: ChartMarkState<AttendanceRow, ChartBarStateStyle<AttendanceRow>>[] = [
  {
    when: ({ focus, matches }) => focus.source === "legend" && !matches("series"),
    style: { opacity: 0.3 },
    transition: { type: "tween", duration: 120, easing: "ease-out" },
  },
];

interface CheckinRateRow {
  edition: string;
  rate: number;
}

interface AttendanceRow {
  edition: string;
  series: AttendanceSeries;
  count: number;
}

function editionLabel(edition: EditionAttendanceStats): string {
  return `${edition.year} ${edition.month}`;
}

export default function AnalyticsDashboard({ authHeaders }: AnalyticsDashboardProps) {
  const [showTable, setShowTable] = useState(false);
  const [exportingEditionId, setExportingEditionId] = useState<string | null>(null);
  const [chartExportError, setChartExportError] = useState("");
  const attendanceChartRef = useRef<HTMLDivElement>(null);
  const [ledgerExportError, setLedgerExportError] = useState("");
  const [ledgerEdition, setLedgerEdition] = useState<{ id: string; label: string } | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSorting, setLedgerSorting] = useState<SortingState>([]);
  const [visibleSeries, setVisibleSeries] = useState<readonly AttendanceSeries[]>([
    "guests",
    "checkedIn",
  ]);

  const handleExportLedger = useCallback(
    async (editionId: string) => {
      setLedgerExportError("");
      setExportingEditionId(editionId);
      try {
        await downloadPaymentTransactionsCsv(authHeaders, { editionId });
      } catch (err) {
        devError("Failed to export payment ledger", err);
        setLedgerExportError(
          err instanceof Error ? err.message : m.admin_analytics_export_ledger_error(),
        );
      } finally {
        setExportingEditionId(null);
      }
    },
    [authHeaders],
  );

  const handleExportChart = useCallback(
    async (format: "svg" | "png") => {
      const target = attendanceChartRef.current;
      if (!target) return;
      setChartExportError("");
      try {
        const { downloadAttendanceChartPng, downloadAttendanceChartSvg } =
          await import("./analyticsChartExport");
        const options = {
          target,
          filename: `${CHART_EXPORT_FILENAME}.${format}`,
          background: CHART_EXPORT_BACKGROUND,
          legend: ATTENDANCE_SERIES.filter((series) => visibleSeries.includes(series)).map(
            (series) => ({
              label:
                series === "guests"
                  ? m.admin_analytics_legend_guests()
                  : m.admin_analytics_legend_checked_in(),
              colorVar: SERIES_COLOR_VARS[series],
            }),
          ),
        };
        if (format === "svg") downloadAttendanceChartSvg(options);
        else await downloadAttendanceChartPng(options);
      } catch (err) {
        devError("Failed to export attendance chart", err);
        setChartExportError(m.admin_analytics_export_chart_error());
      }
    },
    [visibleSeries],
  );

  const ledgerActiveSort = ledgerSorting[0];
  const ledgerBackendSort = ledgerActiveSort
    ? LEDGER_SORT_KEY_BY_COLUMN[ledgerActiveSort.id]
    : undefined;
  const ledgerBackendSortDir: "asc" | "desc" = ledgerActiveSort?.desc ? "desc" : "asc";

  const editionLedgerQuery = useQuery({
    queryKey: queryKeys.admin.paymentTransactionsLedger({
      editionId: ledgerEdition?.id ?? "",
      sort: ledgerBackendSort,
      sortDir: ledgerBackendSort ? ledgerBackendSortDir : undefined,
      page: ledgerPage,
    }),
    queryFn: () =>
      fetchPaymentTransactionsLedger(authHeaders, {
        editionId: ledgerEdition!.id,
        sort: ledgerBackendSort,
        sortDir: ledgerBackendSort ? ledgerBackendSortDir : undefined,
        page: ledgerPage,
      }),
    enabled: ledgerEdition !== null,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    retry: false,
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.admin.editionStats,
    queryFn: () => fetchEditionStats(authHeaders),
    staleTime: 60 * 1000,
  });

  if (statsQuery.error) {
    devError("Failed to load edition attendance stats", statsQuery.error);
  }

  const editions = useMemo(() => statsQuery.data ?? [], [statsQuery.data]);

  const attendanceChart = useMemo(() => {
    if (editions.length === 0) return null;

    const rows: AttendanceRow[] = editions.flatMap((edition) => [
      { edition: edition.editionId, series: "guests", count: edition.totalGuests },
      { edition: edition.editionId, series: "checkedIn", count: edition.totalCheckedIn },
    ]);
    const editionLabelById = new Map(
      editions.map((edition) => [edition.editionId, editionLabel(edition)]),
    );

    return defineChart({
      marks: [
        barY(rows, {
          x: "edition",
          y: "count",
          color: "series",
          layout: group({ padding: 0.25 }),
          inset: 1,
          radius: { end: 4 },
          states: LEGEND_EMPHASIS_STATES,
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().paddingInner(0.3).paddingOuter(0.1),
          axis: {
            ticks: {
              format: (editionId: string) => editionLabelById.get(editionId) ?? editionId,
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
        },
      },
      color: {
        domain: [...ATTENDANCE_SERIES],
        legend: interactiveColorLegend({
          hover: "series",
          visible: controlledSignal(visibleSeries, (next) => setVisibleSeries(next)),
          placement: "top",
          ariaLabel: m.admin_analytics_legend_toggle_aria(),
          format: (value) =>
            value === "guests"
              ? m.admin_analytics_legend_guests()
              : m.admin_analytics_legend_checked_in(),
        }),
      },
      theme: {
        foreground: "var(--viz-text-secondary)",
        muted: "var(--viz-text-muted)",
        grid: "var(--viz-gridline)",
        background: "transparent",
      },
      focus: "group-x",
      keyboard: true,
      tooltip,
    });
  }, [editions, visibleSeries]);

  const checkinRateChart = useMemo(() => {
    const rows: CheckinRateRow[] = editions
      .filter((edition) => edition.totalGuests > 0)
      .map((edition) => ({
        edition: edition.editionId,
        rate: Math.round((edition.totalCheckedIn / edition.totalGuests) * 1000) / 10,
      }));
    if (rows.length === 0) return null;

    const editionLabelById = new Map(
      editions.map((edition) => [edition.editionId, editionLabel(edition)]),
    );

    return defineChart({
      marks: [
        barY(rows, {
          x: "edition",
          y: "rate",
          fill: "var(--ts-chart-2)",
          inset: 1,
          radius: { end: 4 },
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().paddingInner(0.3).paddingOuter(0.1),
          axis: {
            ticks: {
              format: (editionId: string) => editionLabelById.get(editionId) ?? editionId,
            },
          },
        },
        y: {
          scale: scaleLinear().domain([0, 100]),
          grid: true,
          axis: {
            label: m.admin_analytics_checkin_rate_label(),
            ticks: { format: (value: number) => `${value}%` },
          },
        },
      },
      theme: {
        foreground: "var(--viz-text-secondary)",
        muted: "var(--viz-text-muted)",
        grid: "var(--viz-gridline)",
        background: "transparent",
      },
      focus: "group-x",
      keyboard: true,
      tooltip,
    });
  }, [editions]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-medium leading-tight mb-0">{m.admin_analytics_title()}</h2>
        <div className="flex gap-2 flex-wrap">
          {!showTable && editions.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => void handleExportChart("svg")}>
                <Icon icon={DownloadIcon} /> {m.admin_analytics_export_chart_svg()}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleExportChart("png")}>
                <Icon icon={DownloadIcon} /> {m.admin_analytics_export_chart_png()}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowTable((v) => !v)}>
            {showTable ? m.admin_analytics_view_chart() : m.admin_analytics_view_table()}
          </Button>
        </div>
      </div>

      {statsQuery.error && (
        <Alert variant="danger" className="mb-4">
          {m.admin_error_load_data()}
        </Alert>
      )}

      {chartExportError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="mb-4">
          {chartExportError}
        </Alert>
      )}

      {ledgerExportError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="mb-4">
          {ledgerExportError}
        </Alert>
      )}

      {statsQuery.isPending ? (
        <div className="text-center py-12">
          <Spinner variant="primary" role="status">
            <span className="sr-only">{m.admin_loading()}</span>
          </Spinner>
        </div>
      ) : editions.length === 0 ? (
        <p className="text-subtle">{m.admin_analytics_no_data()}</p>
      ) : showTable ? (
        <Table>
          <caption className="sr-only">{m.admin_analytics_table_caption()}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{m.admin_analytics_column_edition()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_events()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_registrations()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_guests()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_checked_in()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_checkin_rate()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_total_paid()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_total_due()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_total_received()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_total_refunded()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_total_outstanding()}</TableHead>
              <TableHead scope="col">{m.admin_analytics_column_total_refund_liability()}</TableHead>
              <TableHead scope="col">{m.admin_actions_label()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editions.map((edition) => (
              <TableRow key={edition.editionId}>
                <TableCell>
                  {edition.year} {edition.month}
                </TableCell>
                <TableCell>{edition.eventsCount}</TableCell>
                <TableCell>{edition.totalRegistrations}</TableCell>
                <TableCell>{edition.totalGuests}</TableCell>
                <TableCell>{edition.totalCheckedIn}</TableCell>
                <TableCell>
                  {edition.totalGuests > 0
                    ? `${Math.round((edition.totalCheckedIn / edition.totalGuests) * 100)}%`
                    : "—"}
                </TableCell>
                <TableCell>€{edition.totalPaid.toFixed(2)}</TableCell>
                <TableCell>€{edition.totalDue.toFixed(2)}</TableCell>
                <TableCell>€{edition.totalReceived.toFixed(2)}</TableCell>
                <TableCell>€{edition.totalRefunded.toFixed(2)}</TableCell>
                <TableCell>€{edition.totalOutstanding.toFixed(2)}</TableCell>
                <TableCell>€{edition.totalRefundLiability.toFixed(2)}</TableCell>
                <TableCell className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="py-0 px-1"
                    onClick={() => {
                      setLedgerPage(1);
                      setLedgerSorting([]);
                      setLedgerEdition({
                        id: edition.editionId,
                        label: `${edition.year} ${edition.month}`,
                      });
                    }}
                    title={m.admin_payment_view_ledger()}
                    aria-label={m.admin_payment_view_ledger_for({
                      edition: `${edition.year} ${edition.month}`,
                    })}
                  >
                    <Icon icon={NotebookTextIcon} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="py-0 px-1"
                    disabled={exportingEditionId === edition.editionId}
                    onClick={() => void handleExportLedger(edition.editionId)}
                    title={m.admin_analytics_export_ledger()}
                    aria-label={m.admin_analytics_export_ledger_for({
                      edition: `${edition.year} ${edition.month}`,
                    })}
                  >
                    {exportingEditionId === edition.editionId ? (
                      <Spinner size="sm" />
                    ) : (
                      <Icon icon={FileSpreadsheetIcon} />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="viz-root">
          <div ref={attendanceChartRef}>
            {attendanceChart && (
              <Chart
                definition={attendanceChart}
                renderer={chartRenderer}
                height={CHART_HEIGHT}
                ariaLabel={m.admin_analytics_chart_aria()}
                ariaDescription={m.admin_analytics_chart_description()}
              />
            )}
          </div>
          {checkinRateChart && (
            <section className="mt-6" aria-labelledby="analytics-checkin-rate-heading">
              <h3
                id="analytics-checkin-rate-heading"
                className="text-lg font-medium leading-tight mb-2"
              >
                {m.admin_analytics_checkin_rate_title()}
              </h3>
              <Chart
                definition={checkinRateChart}
                renderer={chartRenderer}
                height={CHART_HEIGHT}
                ariaLabel={m.admin_analytics_checkin_rate_aria()}
                ariaDescription={m.admin_analytics_checkin_rate_description()}
              />
            </section>
          )}
        </div>
      )}

      {ledgerEdition && (
        <LedgerModal
          show
          title={`${m.admin_ledger_modal_title()} — ${ledgerEdition.label}`}
          transactions={editionLedgerQuery.data?.transactions ?? []}
          total={editionLedgerQuery.data?.total ?? 0}
          limit={editionLedgerQuery.data?.limit ?? LEDGER_PAGE_SIZE}
          loading={editionLedgerQuery.isPending}
          isFetching={editionLedgerQuery.isFetching}
          error={editionLedgerQuery.isError}
          page={ledgerPage}
          sorting={ledgerSorting}
          onSortingChange={(updater) => {
            const next = typeof updater === "function" ? updater(ledgerSorting) : updater;
            setLedgerSorting(next);
            setLedgerPage(1);
          }}
          onPreviousPage={() => setLedgerPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setLedgerPage((p) => p + 1)}
          onHide={() => setLedgerEdition(null)}
        />
      )}
    </div>
  );
}
