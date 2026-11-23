import { jsonResponse } from "@/mocks/response";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw/http";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import MemberStampCards from "@/features/admin/people/MemberStampCards";
import StampCardTypes from "@/features/admin/people/StampCardTypes";
import { createTestQueryClientWrapper } from "../../../utils/queryClient";

afterEach(cleanup);
it("confirms hand-out and displays a translated refusal without closing", async () => {
  const writes: unknown[] = [];
  server.use(
    http.get("/api/stamp-cards/people/alice", () =>
      jsonResponse<import("@/api-types").StampCardOut[]>([
        {
          person_id: "",
          type_id: "",
          reward_label_fr: null,
          reward_label_en: null,
          id: "card",
          box_count: 2,
          opened_at: "2026-10-01T12:00:00Z",
          completed_at: "2026-10-24T12:00:00Z",
          reward_label_nl: "Fles",
          stamps: [
            { card_id: "", registration_id: "", created_at: "2026-01-01T00:00:00Z", id: "1" },
            { card_id: "", registration_id: "", created_at: "2026-01-01T00:00:00Z", id: "2" },
          ],
          reward: {
            card_id: "",
            reward_label_fr: null,
            reward_label_en: null,
            handed_out_by: null,
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
        /* Fixture exception: error response; intentionally outside the success schema. */ {
          code: "stamp_card_has_successor",
          detail: "English diagnostic",
        },
        { status: 409 },
      );
    }),
  );
  render(
    <MemberStampCards
      person={{ id: "alice", name: "Alice" }}

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
    http.get("/api/stamp-cards/types", () =>
      jsonResponse<import("@/api-types").StampCardTypeOut[]>([]),
    ),
    http.get("/api/settings", () =>
      jsonResponse<import("@/api-types").AppSettingsOut>({
        member_limit: null,
        member_inactivity_months: null,
        maintenance_mode: false,
        public_email: "",
        public_phone: "",
        facebook_url: "",
        updated_at: "2026-01-01T00:00:00Z",
        stamp_card_type_id: null,
      }),
    ),
    http.post("/api/stamp-cards/types", async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json(
        /* Fixture exception: error response; intentionally outside the success schema. */ {
          detail: "English diagnostic",
        },
        { status: 500 },
      );
    }),
  );
  render(<StampCardTypes />, { wrapper: createTestQueryClientWrapper() });
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
