/**
 * AnalyticsDashboard — cross-edition attendance/check-in trend view.
 *
 * A grouped bar chart (guests registered vs. checked in, per edition,
 * chronological) built with TanStack Charts. A table view of the same
 * data is always available alongside it.
 */

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type SortingState } from "@tanstack/react-table";
import { barY, defineChart, group } from "@tanstack/charts";
import { controlledSignal } from "@tanstack/charts/interaction/signal";
import { interactiveColorLegend } from "@tanstack/charts/legend";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
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
 * Validated categorical palette slots (blue, aqua) for this app's dark
 * chart surface — see analyticsDashboard.css's header comment for the
 * validation command. TanStack Charts' `color.range` needs literal
 * values, not CSS custom properties.
 */
const SERIES_COLORS = { guests: "#3987e5", checkedIn: "#199e70" } as const;

type AttendanceSeries = keyof typeof SERIES_COLORS;

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
        domain: ["guests", "checkedIn"],
        range: [SERIES_COLORS.guests, SERIES_COLORS.checkedIn],
        legend: interactiveColorLegend({
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

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h2 className="h4 mb-0">{m.admin_analytics_title()}</h2>
        <Button variant="outline-secondary" size="sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? m.admin_analytics_view_chart() : m.admin_analytics_view_table()}
        </Button>
      </div>

      {statsQuery.error && (
        <Alert variant="danger" className="mb-3">
          {m.admin_error_load_data()}
        </Alert>
      )}

      {ledgerExportError && (
        <Alert role="alert" aria-live="assertive" variant="danger" className="mb-3">
          {ledgerExportError}
        </Alert>
      )}

      {statsQuery.isPending ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" role="status">
            <span className="visually-hidden">{m.admin_loading()}</span>
          </Spinner>
        </div>
      ) : editions.length === 0 ? (
        <p className="text-secondary">{m.admin_analytics_no_data()}</p>
      ) : showTable ? (
        <Table striped bordered hover responsive size="sm" variant="dark">
          <caption className="visually-hidden">{m.admin_analytics_table_caption()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.admin_analytics_column_edition()}</th>
              <th scope="col">{m.admin_analytics_column_events()}</th>
              <th scope="col">{m.admin_analytics_column_registrations()}</th>
              <th scope="col">{m.admin_analytics_column_guests()}</th>
              <th scope="col">{m.admin_analytics_column_checked_in()}</th>
              <th scope="col">{m.admin_analytics_column_checkin_rate()}</th>
              <th scope="col">{m.admin_analytics_column_total_paid()}</th>
              <th scope="col">{m.admin_analytics_column_total_due()}</th>
              <th scope="col">{m.admin_analytics_column_total_received()}</th>
              <th scope="col">{m.admin_analytics_column_total_refunded()}</th>
              <th scope="col">{m.admin_analytics_column_total_outstanding()}</th>
              <th scope="col">{m.admin_analytics_column_total_refund_liability()}</th>
              <th scope="col">{m.admin_actions_label()}</th>
            </tr>
          </thead>
          <tbody>
            {editions.map((edition) => (
              <tr key={edition.editionId}>
                <td>
                  {edition.year} {edition.month}
                </td>
                <td>{edition.eventsCount}</td>
                <td>{edition.totalRegistrations}</td>
                <td>{edition.totalGuests}</td>
                <td>{edition.totalCheckedIn}</td>
                <td>
                  {edition.totalGuests > 0
                    ? `${Math.round((edition.totalCheckedIn / edition.totalGuests) * 100)}%`
                    : "—"}
                </td>
                <td>€{edition.totalPaid.toFixed(2)}</td>
                <td>€{edition.totalDue.toFixed(2)}</td>
                <td>€{edition.totalReceived.toFixed(2)}</td>
                <td>€{edition.totalRefunded.toFixed(2)}</td>
                <td>€{edition.totalOutstanding.toFixed(2)}</td>
                <td>€{edition.totalRefundLiability.toFixed(2)}</td>
                <td className="d-flex gap-1">
                  <Button
                    variant="outline-secondary"
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
                    <i className="bi bi-journal-text" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline-secondary"
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
                      <Spinner as="span" animation="border" size="sm" />
                    ) : (
                      <i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" />
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <div className="viz-root">
          {attendanceChart && (
            <Chart
              definition={attendanceChart}
              renderer={chartRenderer}
              height={CHART_HEIGHT}
              ariaLabel={m.admin_analytics_chart_aria()}
            />
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
