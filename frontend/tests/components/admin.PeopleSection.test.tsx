import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderSection() {
  render(
    <PeopleSection
      authHeaders={() => ({})}
      counts={{ all: 5, members: 3, volunteers: 2 }}
      people={{ ...handlers, onMerge: vi.fn() }}
      members={{ ...handlers, onEnd: handlers.onDelete, onReactivate: handlers.onDelete }}
      volunteers={{ ...handlers, onEnd: handlers.onDelete, onReactivate: handlers.onDelete }}
    />,
  );
}

describe("PeopleSection", () => {
  it("shows one list with a count on each role view", () => {
    renderSection();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All people (5)",
      "Champagnelovers (3)",
      "Volunteers (2)",
    ]);
    expect(screen.getByText("all-people-view")).toBeInTheDocument();
  });

  it("switches between the all, members and volunteers views", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("tab", { name: "Champagnelovers (3)" }));
    expect(screen.getByText("members-view")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("all-people-view")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Volunteers (2)" }));
    expect(screen.getByText("volunteers-view")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("members-view")).not.toBeInTheDocument());
  });
});
