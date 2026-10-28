import { renderLocation } from "../utils/locationRouter";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PeopleSection from "@/components/admin/PeopleSection";

vi.mock("@/components/admin/PeopleManagement", () => ({
  default: () => <div>all-people-view</div>,
}));
vi.mock("@/components/admin/MembersManagement", () => ({
  default: () => <div>members-view</div>,
}));
vi.mock("@/components/admin/VolunteersManagement", () => ({
  default: () => <div>volunteers-view</div>,
}));

afterEach(cleanup);

const handlers = { onCreate: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() };

async function renderSection(entry = "/admin") {
  return renderLocation(
    <PeopleSection
      authHeaders={() => ({})}
      counts={{ all: 5, members: 3, volunteers: 2 }}
      people={{ ...handlers, onMerge: vi.fn() }}
      members={{ ...handlers, onDeactivate: handlers.onDelete, onReactivate: handlers.onDelete }}
      volunteers={{ ...handlers, onDeactivate: handlers.onDelete, onReactivate: handlers.onDelete }}
    />,
    entry,
  );
}

describe("PeopleSection", () => {
  it("restores a deep-linked tab and preserves list state through Back/Forward", async () => {
    const router = await renderSection(
      "/admin?section=people&peopleTab=volunteers&members=%7B%22page%22%3A2%7D",
    );
    await screen.findByText("volunteers-view");
    fireEvent.click(screen.getByRole("tab", { name: "Members (3)" }));
    await screen.findByText("members-view");
    expect(router.state.location.search.members).toEqual({ page: 2 });
    router.history.back();
    await screen.findByText("volunteers-view");
    router.history.forward();
    await screen.findByText("members-view");
  });

  it("shows one list with a count on each role view", async () => {
    await renderSection();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All people (5)",
      "Members (3)",
      "Volunteers (2)",
    ]);
    expect(screen.getByText("all-people-view")).toBeInTheDocument();
  });

  it("switches between the all, members and volunteers views", async () => {
    await renderSection();

    fireEvent.click(screen.getByRole("tab", { name: "Members (3)" }));
    await screen.findByText("members-view");
    await waitFor(() => expect(screen.queryByText("all-people-view")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Volunteers (2)" }));
    await screen.findByText("volunteers-view");
    await waitFor(() => expect(screen.queryByText("members-view")).not.toBeInTheDocument());
  });
});
