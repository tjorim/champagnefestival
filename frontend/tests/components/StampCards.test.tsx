import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw/http";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import MemberStampCards from "@/components/admin/MemberStampCards";
import StampCardTypes from "@/components/admin/StampCardTypes";
import { createTestQueryClientWrapper } from "../utils/queryClient";
const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });
afterEach(cleanup);
it("confirms hand-out and displays a translated refusal without closing", async () => {
  const writes: unknown[] = [];
  server.use(
    http.get("/api/stamp-cards/people/alice", () =>
      HttpResponse.json([
        {
          id: "card",
          box_count: 2,
          opened_at: "2026-10-01T12:00:00Z",
          completed_at: "2026-10-24T12:00:00Z",
          reward_label_nl: "Fles",
          stamps: [{ id: "1" }, { id: "2" }],
          reward: {
            id: "reward",
            reward_label_nl: "Fles",
            earned_at: "2026-10-24T12:00:00Z",
            handed_out_at: "2026-10-24T13:00:00Z",
          },
        },
      ]),
    ),
    http.put("/api/stamp-cards/rewards/reward", async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json(
        { code: "stamp_card_has_successor", detail: "English diagnostic" },
        { status: 409 },
      );
    }),
  );
  render(
    <MemberStampCards
      person={{ id: "alice", name: "Alice" }}
      authHeaders={authHeaders}
      onClose={vi.fn()}
    />,
    { wrapper: createTestQueryClientWrapper() },
  );
  expect(await screen.findByText(m.stamp_progress({ count: 2, total: 2 }))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: m.stamp_undo_hand_out() }));
  expect(writes).toEqual([]);
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: m.stamp_undo_hand_out() }),
  );
  expect(await screen.findByText(m.stamp_error_successor())).toBeTruthy();
  expect(writes).toEqual([{ handed_out: false }]);
  expect(screen.queryByText("English diagnostic")).toBeNull();
  expect(screen.getByRole("alertdialog")).toBeTruthy();
});
it("preserves the translated type draft after one failed write", async () => {
  const writes: unknown[] = [];
  server.use(
    http.get("/api/stamp-cards/types", () => HttpResponse.json([])),
    http.get("/api/settings", () => HttpResponse.json({ stamp_card_type_id: null })),
    http.post("/api/stamp-cards/types", async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json({ detail: "English diagnostic" }, { status: 500 });
    }),
  );
  render(<StampCardTypes authHeaders={authHeaders} />, { wrapper: createTestQueryClientWrapper() });
  fireEvent.click(screen.getByRole("button", { name: m.stamp_add_type() }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(m.stamp_name({ locale: "nl" })), {
    target: { value: "Kaart" },
  });
  fireEvent.change(within(dialog).getByLabelText(m.stamp_reward_label({ locale: "nl" })), {
    target: { value: "Fles" },
  });
  fireEvent.submit(document.getElementById("stamp-type-form")!);
  expect(await within(dialog).findByText(m.stamp_error())).toBeTruthy();
  expect(writes).toHaveLength(1);
  expect(within(dialog).getByLabelText(m.stamp_name({ locale: "nl" }))).toHaveValue("Kaart");
  expect(writes[0]).toMatchObject({
    name_nl: "Kaart",
    name_fr: null,
    reward_label_nl: "Fles",
    box_count: 10,
  });
});
