import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AuditLogViewer from "@/components/admin/AuditLogViewer";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const { fetchAuditEntries, fetchAuditResourceTypes } = vi.hoisted(() => ({
  fetchAuditEntries: vi.fn(),
  fetchAuditResourceTypes: vi.fn(),
}));

vi.mock("@/utils/adminFetch", () => ({
  fetchAuditEntries,
  fetchAuditResourceTypes,
}));

function renderAuditLogViewer() {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuditLogViewer authHeaders={() => ({})} />
    </QueryClientProvider>,
  );
}

describe("AuditLogViewer", () => {
  beforeEach(() => {
    fetchAuditEntries.mockReset();
    fetchAuditResourceTypes.mockReset();
    fetchAuditResourceTypes.mockResolvedValue(["venue", "table"]);
  });

  it("shows an empty-state message when there are no entries", async () => {
    fetchAuditEntries.mockResolvedValue([]);
    renderAuditLogViewer();

    await waitFor(() => expect(screen.getByText("admin_audit_no_entries")).toBeInTheDocument());
  });

  it("renders returned audit entries in the table", async () => {
    fetchAuditEntries.mockResolvedValue([
      {
        id: "aud_1",
        timestamp: "2026-01-01T12:00:00Z",
        actor: "admin@example.com",
        action: "venue_created",
        resourceType: "venue",
        resourceId: "venue_abc123",
        requestId: null,
        details: { name: "Test Venue" },
      },
    ]);
    renderAuditLogViewer();

    await waitFor(() => expect(screen.getByText("venue_created")).toBeInTheDocument());
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText(/venue \/ venue_abc123/)).toBeInTheDocument();
  });

  it("populates the resource type filter from fetchAuditResourceTypes", async () => {
    fetchAuditEntries.mockResolvedValue([]);
    renderAuditLogViewer();

    await waitFor(() => expect(screen.getByRole("option", { name: "venue" })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "table" })).toBeInTheDocument();
  });
});
