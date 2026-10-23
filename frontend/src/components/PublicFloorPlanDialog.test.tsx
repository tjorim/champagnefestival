import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw/http";
import { afterEach, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import type { EditionPlan } from "@/utils/planApi";
import PublicFloorPlanDialog from "./PublicFloorPlanDialog";

const area = (id: string, label: string, organizationId: number | null) => ({
  id,
  label,
  icon: "bi-shop",
  x: 10,
  y: 20,
  rotation: 0,
  width_m: 2,
  length_m: 1,
  organization_id: organizationId,
});

const room = (id: string, name: string, areas: ReturnType<typeof area>[]) => ({
  id,
  name,
  width_m: 20,
  length_m: 10,
  color: "#6c757d",
  areas,
});

const plan: EditionPlan = {
  edition_id: "2099",
  days: [
    {
      event_id: "fri",
      date: "2099-03-20",
      rooms: [room("r1", "Hall 5", [area("a1", "Stand 12", 1), area("a2", "Main Stage", null)])],
    },
    {
      event_id: "sat",
      date: "2099-03-21",
      rooms: [
        room("r1", "Hall 5", [area("a3", "Stand 7", 2)]),
        room("r2", "Cellar", [area("a4", "Stand 3", 1)]),
      ],
    },
  ],
};

const target = {
  organizationId: 1,
  stand: { event_id: "sat", date: "2099-03-21", room_name: "Cellar", label: "Stand 3" },
};

function mount(overrides: Partial<Parameters<typeof PublicFloorPlanDialog>[0]> = {}) {
  setLocale("en", { reload: false });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PublicFloorPlanDialog
        editionId="2099"
        target={target}
        organizationName="Bollinger"
        locale="en"
        onClose={() => {}}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

it("opens the stand's day and room with the stand highlighted", async () => {
  server.use(http.get("/api/editions/2099/plan", () => HttpResponse.json(plan)));
  mount();

  const canvas = await screen.findByRole("region", { name: "Floor plan of Cellar" });
  const highlighted = within(canvas).getByText("Stand 3").closest("[aria-current]");
  expect(highlighted).toHaveAttribute("aria-current", "location");
  expect(screen.getByRole("status")).toHaveTextContent("Bollinger: Stand 3");
  expect(screen.getByRole("button", { name: /Sat/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Cellar" })).toHaveAttribute("aria-pressed", "true");
});

it("switches day and room, and says when the organization is not in the room", async () => {
  server.use(http.get("/api/editions/2099/plan", () => HttpResponse.json(plan)));
  mount();
  await screen.findByRole("region", { name: "Floor plan of Cellar" });

  fireEvent.click(screen.getByRole("button", { name: "Hall 5" }));
  expect(screen.getByRole("region", { name: "Floor plan of Hall 5" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Bollinger has no stand in this room.");

  // Friday has a single room: no room switcher, and the stand there is highlighted.
  fireEvent.click(screen.getByRole("button", { name: /Fri/ }));
  expect(screen.queryByRole("group", { name: "Room" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Bollinger: Stand 12");
});

it("supports room keyboard navigation and keeps a room selected", async () => {
  server.use(http.get("/api/editions/2099/plan", () => HttpResponse.json(plan)));
  const user = userEvent.setup();
  mount();
  await screen.findByRole("region", { name: "Floor plan of Cellar" });
  const cellar = screen.getByRole("button", { name: "Cellar" });
  await user.click(cellar);
  expect(cellar).toHaveAttribute("aria-pressed", "true");
  await user.keyboard("{ArrowLeft}");
  const hall = screen.getByRole("button", { name: "Hall 5" });
  expect(hall).toHaveFocus();
  await user.keyboard(" ");
  expect(hall).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("region", { name: "Floor plan of Hall 5" })).toBeInTheDocument();
});

it("falls back to a message when the plan cannot be loaded", async () => {
  server.use(http.get("/api/editions/2099/plan", () => HttpResponse.json({}, { status: 500 })));
  mount();

  expect(await screen.findByText(/floor plan could not be loaded/i)).toBeInTheDocument();
});

it("says the plan is unavailable when it is empty", async () => {
  server.use(
    http.get("/api/editions/2099/plan", () => HttpResponse.json({ edition_id: "2099", days: [] })),
  );
  mount();

  expect(await screen.findByText(/floor plan is not available/i)).toBeInTheDocument();
});

it("does not fetch while closed", () => {
  let requested = false;
  server.use(
    http.get("/api/editions/2099/plan", () => {
      requested = true;
      return HttpResponse.json(plan);
    }),
  );
  mount({ target: null });

  expect(requested).toBe(false);
});
