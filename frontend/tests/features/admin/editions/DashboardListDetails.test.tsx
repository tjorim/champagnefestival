import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentSection } from "@/features/admin/editions/ContentManagement";
import EditionCard from "@/features/admin/editions/EditionCard";
import { seedEditions } from "@/mocks/data/editions";
import { seedOrganizations } from "@/mocks/data/organizations";
import { getLocale } from "@/paraglide/runtime";
import { createTestQueryClient } from "../../../utils/queryClient";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("Dashboard lists", () => {
  it("uses the organisation image source for the thumbnail and omits the path text", async () => {
    const organization = seedOrganizations[0]!;
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ContentSection sectionKey="organizations" title="Organisations" />
      </QueryClientProvider>,
    );

    const row = (await screen.findByText(organization.name)).closest("li")!;
    expect(row.querySelector("img")).toHaveAttribute("src", organization.image);
    expect(within(row).queryByText(organization.image)).not.toBeInTheDocument();
  });

  it("opens an edition at the linked event and shows formatted dates and lineup names", async () => {
    const edition = seedEditions[0]!;
    const event = edition.events[0]!;
    window.history.replaceState(null, "", `/admin?section=editions#audit-event-${event.id}`);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <EditionCard
          edition={edition}
          venues={[edition.venue]}

          onDeleted={vi.fn()}
          onUpdated={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/Maison Moët & Chandon/)).toBeVisible();
    const eventRow = (await screen.findByText(event.title)).closest("li")!;
    expect(eventRow).toHaveAttribute("id", `audit-event-${event.id}`);
    const formattedDate = new Intl.DateTimeFormat(getLocale() === "en" ? "en-GB" : getLocale(), {
      dateStyle: "medium",
    }).format(new Date(`${event.date}T00:00:00`));
    expect(within(eventRow).getByText(formattedDate)).toBeVisible();
    expect(within(eventRow).queryByText(event.date)).not.toBeInTheDocument();
  });
});
