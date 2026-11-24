import { jsonResponse } from "../../response";
import type { EditionAttendanceStats } from "@/api-types";
import { http } from "msw/http";
import { requireAuth } from "./auth";

export const analyticsHandlers = [
  // ──────────────────────────────────────────────────────────────
  // Analytics
  // ──────────────────────────────────────────────────────────────
  http.get("/api/editions/stats", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const base = {
      edition_type: "festival" as const,
      start_date: null,
      total_paid: "0",
      total_due: "0",
      total_received: "0",
      total_refunded: "0",
      total_outstanding: "0",
      total_refund_liability: "0",
    };
    const stats: EditionAttendanceStats[] = [
      {
        ...base,
        edition_id: "edition-2024",
        year: 2024,
        month: "march",
        events_count: 4,
        total_registrations: 62,
        total_guests: 140,
        total_checked_in: 98,
      },
      {
        ...base,
        edition_id: "edition-2025",
        year: 2025,
        month: "march",
        events_count: 5,
        total_registrations: 88,
        total_guests: 190,
        total_checked_in: 171,
      },
      {
        ...base,
        edition_id: "edition-2026",
        year: 2026,
        month: "march",
        events_count: 5,
        total_registrations: 12,
        total_guests: 0,
        total_checked_in: 0,
      },
    ];
    return jsonResponse<import("@/api-types").EditionAttendanceStats[]>(stats);
  }),
];
