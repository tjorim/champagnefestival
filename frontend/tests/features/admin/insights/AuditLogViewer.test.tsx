import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuditEntryOut } from "@/api-types";
import AuditLogViewer from "@/features/admin/insights/AuditLogViewer";
import { createTestQueryClient } from "../../../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const { fetchAuditActions, fetchAuditActors, fetchAuditEntries, fetchAuditResourceTypes } =
  vi.hoisted(() => ({
    fetchAuditActions: vi.fn(),
    fetchAuditActors: vi.fn(),
    fetchAuditEntries: vi.fn(),
    fetchAuditResourceTypes: vi.fn(),
  }));

vi.mock("@/lib/api/adminFetch", () => ({
  fetchAuditActions,
  fetchAuditActors,
  fetchAuditEntries,
  fetchAuditResourceTypes,
}));

function renderAuditLogViewer() {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuditLogViewer />
    </QueryClientProvider>,
  );
}

describe("AuditLogViewer", () => {
  beforeEach(() => {
    fetchAuditActors.mockResolvedValue([
      { actor: "admin@example.com", actor_label: { kind: "person", name: "Alex Martin" } },
    ]);
    fetchAuditActions.mockResolvedValue(["venue_created"]);
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
        actor_label: { kind: "person", name: "Alex Martin" },
        action: "venue_created",
        auth_source: "keycloak",
        subject: null,
        integration_client_id: null,
        resource_type: "venue",
        resource_id: "venue_abc123",
        resource_name: "Renamed Venue",
        resource_exists: true,
        request_id: null,
        details: { name: "Test Venue" },
      } satisfies AuditEntryOut,
    ]);
    renderAuditLogViewer();

    await waitFor(() =>
      expect(
        screen.getByText("admin_audit_action_created · admin_audit_resource_venue"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Alex Martin"));
    expect(await screen.findByText("admin@example.com")).toBeVisible();
    expect(screen.getByRole("link", { name: "Renamed Venue" })).toHaveAttribute(
      "href",
      "/admin?section=venues#audit-venue-venue_abc123",
    );
    expect(screen.getByTitle("venue_abc123")).toBeInTheDocument();
    expect(screen.queryByText("venue_abc123")).not.toBeInTheDocument();
  });

  it("populates the resource type filter from fetchAuditResourceTypes", async () => {
    fetchAuditEntries.mockResolvedValue([]);
    renderAuditLogViewer();

    await waitFor(() => expect(fetchAuditResourceTypes).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("combobox", { name: "admin_audit_filter_resource_type" }));
    expect(
      await screen.findByRole("option", { name: "admin_audit_resource_venue" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "admin_audit_resource_table" })).toBeInTheDocument();
  });
});
