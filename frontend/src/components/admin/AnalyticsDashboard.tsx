/**
 * AnalyticsDashboard — cross-edition attendance/check-in trend view.
 *
 * A grouped bar chart (guests registered vs. checked in, per edition,
 * chronological) built as plain SVG — no charting library dependency.
 * A table view of the same data is always available alongside it.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import { fetchEditionStats } from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";
import { devError } from "@/utils/devLog";
import "./analyticsDashboard.css";

interface AnalyticsDashboardProps {
  authHeaders: () => Record<string, string>;
}

const CHART_HEIGHT = 260;
const BAR_WIDTH = 20;
const BAR_GAP = 2;
const GROUP_GAP = 28;
const AXIS_LEFT = 44;
const AXIS_BOTTOM = 36;
const CHART_TOP_PADDING = 16;

/** Round a max value up to a "clean" tick ceiling (nearest 5/10/25/50/100 step). */
function niceCeiling(max: number): number {
  if (max <= 0) return 5;
  const step = max <= 20 ? 5 : max <= 50 ? 10 : max <= 200 ? 25 : max <= 1000 ? 100 : 500;
  return Math.ceil(max / step) * step;
}

export default function AnalyticsDashboard({ authHeaders }: AnalyticsDashboardProps) {
  const [showTable, setShowTable] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const statsQuery = useQuery({
    queryKey: queryKeys.admin.editionStats,
    queryFn: () => fetchEditionStats(authHeaders),
    staleTime: 60 * 1000,
  });

  if (statsQuery.error) {
    devError("Failed to load edition attendance stats", statsQuery.error);
  }

  const editions = useMemo(() => statsQuery.data ?? [], [statsQuery.data]);

  const yMax = useMemo(
    () => niceCeiling(Math.max(1, ...editions.map((e) => Math.max(e.totalGuests, e.totalCheckedIn)))),
    [editions],
  );

  const chartWidth = Math.max(
    400,
    AXIS_LEFT + editions.length * (BAR_WIDTH * 2 + BAR_GAP + GROUP_GAP) + GROUP_GAP,
  );
  const plotHeight = CHART_HEIGHT - AXIS_BOTTOM - CHART_TOP_PADDING;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(yMax * fraction));

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
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <>
          <div className="viz-root">
            <div className="analytics-legend mb-2">
              <span className="analytics-legend-item">
                <span className="analytics-legend-swatch analytics-series-guests" />
                {m.admin_analytics_legend_guests()}
              </span>
              <span className="analytics-legend-item">
                <span className="analytics-legend-swatch analytics-series-checked-in" />
                {m.admin_analytics_legend_checked_in()}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <svg
                width={chartWidth}
                height={CHART_HEIGHT}
                role="img"
                aria-label={m.admin_analytics_chart_aria()}
              >
                <title>{m.admin_analytics_chart_aria()}</title>
                {/* Gridlines + y-axis ticks */}
                {yTicks.map((tick) => {
                  const y = CHART_TOP_PADDING + plotHeight - (tick / yMax) * plotHeight;
                  return (
                    <g key={tick}>
                      <line
                        x1={AXIS_LEFT}
                        x2={chartWidth}
                        y1={y}
                        y2={y}
                        className="analytics-gridline"
                      />
                      <text x={AXIS_LEFT - 8} y={y} className="analytics-axis-label" textAnchor="end" dy="0.32em">
                        {tick.toLocaleString()}
                      </text>
                    </g>
                  );
                })}
                <line
                  x1={AXIS_LEFT}
                  x2={AXIS_LEFT}
                  y1={CHART_TOP_PADDING}
                  y2={CHART_TOP_PADDING + plotHeight}
                  className="analytics-axis-line"
                />
                <line
                  x1={AXIS_LEFT}
                  x2={chartWidth}
                  y1={CHART_TOP_PADDING + plotHeight}
                  y2={CHART_TOP_PADDING + plotHeight}
                  className="analytics-axis-line"
                />

                {/* Bars */}
                {editions.map((edition, index) => {
                  const groupX = AXIS_LEFT + GROUP_GAP + index * (BAR_WIDTH * 2 + BAR_GAP + GROUP_GAP);
                  const guestsHeight = (edition.totalGuests / yMax) * plotHeight;
                  const checkedInHeight = (edition.totalCheckedIn / yMax) * plotHeight;
                  const baseline = CHART_TOP_PADDING + plotHeight;
                  const isHovered = hoveredIndex === index;

                  return (
                    <g key={edition.editionId}>
                      <rect
                        x={groupX}
                        y={baseline - guestsHeight}
                        width={BAR_WIDTH}
                        height={guestsHeight}
                        rx={4}
                        className="analytics-series-guests"
                        opacity={isHovered ? 0.8 : 1}
                      />
                      <rect
                        x={groupX + BAR_WIDTH + BAR_GAP}
                        y={baseline - checkedInHeight}
                        width={BAR_WIDTH}
                        height={checkedInHeight}
                        rx={4}
                        className="analytics-series-checked-in"
                        opacity={isHovered ? 0.8 : 1}
                      />
                      <text
                        x={groupX + BAR_WIDTH + BAR_GAP / 2}
                        y={baseline + 16}
                        className="analytics-axis-label"
                        textAnchor="middle"
                      >
                        {edition.year}
                      </text>
                      {/* Invisible hit area covering the whole group, for hover/focus */}
                      <rect
                        x={groupX - BAR_GAP}
                        y={CHART_TOP_PADDING}
                        width={BAR_WIDTH * 2 + BAR_GAP * 3}
                        height={plotHeight}
                        fill="transparent"
                        tabIndex={0}
                        role="img"
                        aria-label={m.admin_analytics_bar_group_aria({
                          edition: `${edition.year} ${edition.month}`,
                          guests: edition.totalGuests,
                          checkedIn: edition.totalCheckedIn,
                        })}
                        onPointerEnter={() => setHoveredIndex(index)}
                        onPointerLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                        onFocus={() => setHoveredIndex(index)}
                        onBlur={() => setHoveredIndex((current) => (current === index ? null : current))}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
            {hoveredIndex !== null && editions[hoveredIndex] && (
              <div className="analytics-tooltip" role="status">
                <strong>
                  {editions[hoveredIndex].year} {editions[hoveredIndex].month}
                </strong>
                <div>
                  <span className="analytics-legend-swatch analytics-series-guests" />
                  {m.admin_analytics_legend_guests()}: {editions[hoveredIndex].totalGuests}
                </div>
                <div>
                  <span className="analytics-legend-swatch analytics-series-checked-in" />
                  {m.admin_analytics_legend_checked_in()}: {editions[hoveredIndex].totalCheckedIn}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
