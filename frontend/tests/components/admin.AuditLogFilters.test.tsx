/**
 * The audit log's whole purpose is answering "who did this?" and "what happened
 * that weekend?". The API supported actor/action/since/until all along, and
 * `AuditEntryFilters` already plumbed two of them, but nothing set any of it.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import AuditLogViewer from "@/components/admin/AuditLogViewer";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

/** Captures the query string of every /api/audit request the viewer makes. */
function captureAuditQueries() {
  const seen: URLSearchParams[] = [];
  server.use(
    http.get("/api/audit", ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return HttpResponse.json([]);
    }),
    http.get("/api/audit/resource-types", () => HttpResponse.json(["person", "edition"])),
  );
  return seen;
}

function renderViewer() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AuditLogViewer authHeaders={authHeaders} />
    </QueryClientProvider>,
  );
}

describe("AuditLogViewer filters", () => {
  it("sends the actor filter", async () => {
    const seen = captureAuditQueries();
    renderViewer();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("admin_audit_filter_actor"), {
      target: { value: "auth0|abc" },
    });

    await waitFor(() => {
      expect(seen.some((params) => params.get("actor") === "auth0|abc")).toBe(true);
    });
  });

  it("sends the action filter", async () => {
    const seen = captureAuditQueries();
    renderViewer();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("admin_audit_filter_action"), {
      target: { value: "person_merged" },
    });

    await waitFor(() => {
      expect(seen.some((params) => params.get("action") === "person_merged")).toBe(true);
    });
  });

  it("turns a from/until date into a full-day timestamp range", async () => {
    const seen = captureAuditQueries();
    renderViewer();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("admin_audit_filter_since"), {
      target: { value: "2026-11-21" },
    });
    fireEvent.change(screen.getByLabelText("admin_audit_filter_until"), {
      target: { value: "2026-11-21" },
    });

    await waitFor(() => {
      const withRange = seen.find((params) => params.get("since") && params.get("until"));
      expect(withRange).toBeDefined();
      // Whole local day, so a single-day bourse is one filter, not two.
      expect(new Date(withRange!.get("since")!).getTime()).toBeLessThan(
        new Date(withRange!.get("until")!).getTime(),
      );
    });
  });

  it("resets to page 1 when a filter changes", async () => {
    const seen = captureAuditQueries();
    renderViewer();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("admin_audit_filter_actor"), {
      target: { value: "someone" },
    });

    await waitFor(() => {
      const withActor = seen.find((params) => params.get("actor") === "someone");
      expect(withActor?.get("page")).toBe("1");
    });
  });
});
