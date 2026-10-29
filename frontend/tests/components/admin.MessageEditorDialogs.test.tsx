import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw/http";
import { beforeEach, describe, expect, it } from "vitest";
import AnnouncementManagement from "@/components/admin/AnnouncementManagement";
import ComposerManagement from "@/components/admin/ComposerManagement";
import { server } from "@/mocks/server";
import { queryKeys } from "@/utils/queryKeys";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientHarness } from "../utils/queryClient";

const cases = [
  {
    name: "announcements",
    Component: AnnouncementManagement,
    path: "/api/announcements",
    queryKey: queryKeys.admin.announcements,
    newLabel: "Add announcement",
    editTitle: "Edit announcement",
    field: "Text (NL)",
    valueKey: "text_nl",
    create: "Create",
    formId: "announcement-form",
    error: "Announcement could not be saved.",
    saved: {
      id: "record-1",
      text_language: "nl",
      text_nl: "Saved text",
      text_en: null,
      text_fr: null,
      level: "info",
      active: false,
      sort_order: 0,
      starts_at: null,
      ends_at: null,
      link_url: null,
      link_label_nl: null,
      link_label_en: null,
      link_label_fr: null,
    },
  },
  {
    name: "composer drafts",
    Component: ComposerManagement,
    path: "/api/composer",
    queryKey: queryKeys.admin.composerMessages,
    newLabel: "Add message draft",
    editTitle: "Edit message draft",
    field: "Title",
    valueKey: "title_nl",
    create: "Create draft",
    formId: "composer-form",
    error: "The message could not be saved.",
    saved: {
      id: "record-1",
      text_language: "nl",
      title_nl: "Saved text",
      title_en: null,
      title_fr: null,
      body_nl: "Saved body",
      body_en: null,
      body_fr: null,
      channels: ["announcement"],
      level: "info",
      link_url: null,
      state: "draft",
      estimated_push_audience: 0,
    },
  },
];
beforeEach(() => setLocale("en", { reload: false }));
for (const config of cases) {
  describe(`${config.name} editor dialog`, () => {
    function setup() {
      server.use(http.get(config.path, () => HttpResponse.json([config.saved])));
      const { queryClient, Wrapper } = createTestQueryClientHarness();
      render(<config.Component authHeaders={() => ({ Authorization: "Bearer test" })} />, {
        wrapper: Wrapper,
      });
      return queryClient;
    }
    it("starts with a list and retains edits when the list refreshes", async () => {
      const queryClient = setup();
      await screen.findByText("Saved text");
      expect(screen.queryByLabelText(config.field)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Edit Saved text" }));
      expect(await screen.findByRole("dialog", { name: config.editTitle })).toBeInTheDocument();
      expect(screen.getByLabelText(config.field)).toHaveValue("Saved text");
      fireEvent.change(screen.getByLabelText(config.field), { target: { value: "Local changes" } });
      act(() =>
        queryClient.setQueryData(config.queryKey, [
          { ...config.saved, [config.valueKey]: "Remote changes" },
        ]),
      );
      expect(screen.getByLabelText(config.field)).toHaveValue("Local changes");
    });
    it("updates the selected record, closes on success and refreshes the list", async () => {
      let submitted: Record<string, unknown> | undefined;
      setup();
      server.use(
        http.put(`${config.path}/record-1`, async ({ request }) => {
          submitted = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...config.saved, ...submitted });
        }),
        http.get(config.path, () => HttpResponse.json([{ ...config.saved, ...(submitted ?? {}) }])),
      );
      await screen.findByText("Saved text");
      fireEvent.click(screen.getByRole("button", { name: "Edit Saved text" }));
      fireEvent.change(screen.getByLabelText(config.field), { target: { value: "Updated text" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(submitted?.[config.valueKey]).toBe("Updated text");
      expect(await screen.findByText("Updated text")).toBeInTheDocument();
    });
    it("keeps failed saves inside the dialog without exposing diagnostics or retrying", async () => {
      let requests = 0;
      setup();
      server.use(
        http.post(config.path, () => {
          requests += 1;
          return HttpResponse.json({ detail: "Internal diagnostic: do not show" }, { status: 500 });
        }),
      );
      await screen.findByText("Saved text");
      fireEvent.click(screen.getByRole("button", { name: config.newLabel }));
      fireEvent.change(screen.getByLabelText(config.field), {
        target: { value: "Keep this draft" },
      });
      fireEvent.click(screen.getByRole("button", { name: config.create }));
      const dialog = screen.getByRole("dialog", { name: config.newLabel });
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(config.error);
      expect(screen.getByLabelText(config.field)).toHaveValue("Keep this draft");
      expect(screen.queryByText(/Internal diagnostic/)).not.toBeInTheDocument();
      expect(requests).toBe(1);
    });
    it("blocks repeated submission and dismissal until the save completes", async () => {
      let requests = 0;
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      setup();
      server.use(
        http.post(config.path, async () => {
          requests += 1;
          await pending;
          return HttpResponse.json(config.saved, { status: 201 });
        }),
      );
      await screen.findByText("Saved text");
      fireEvent.click(screen.getByRole("button", { name: config.newLabel }));
      const dialog = screen.getByRole("dialog", { name: config.newLabel });
      fireEvent.click(within(dialog).getByRole("button", { name: config.create }));
      await waitFor(() =>
        expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled(),
      );
      fireEvent.submit(document.getElementById(config.formId)!);
      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      expect(screen.getByRole("dialog", { name: config.newLabel })).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      await waitFor(() => expect(requests).toBe(1));
      finish();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(requests).toBe(1);
    });
  });
}
