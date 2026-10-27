import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw/http";
import { describe, expect, it } from "vitest";
import SettingsManagement from "@/components/admin/SettingsManagement";
import { queryKeys } from "@/utils/queryKeys";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness, createTestQueryClientWrapper } from "../utils/queryClient";

const initialSettings = {
  maintenance_mode: false,
  public_email: "old@example.com",
  public_phone: "+32 59 11 22 33",
  facebook_url: "https://www.facebook.com/old",
};

describe("SettingsManagement", () => {
  it("renders the maintenance switch and the contact details as separate sections", async () => {
    server.use(http.get("/api/settings", () => HttpResponse.json(initialSettings)));

    const maintenance = render(
      <SettingsManagement authHeaders={() => ({})} section="maintenance" />,
      { wrapper: createTestQueryClientWrapper() },
    );
    expect(await screen.findByRole("switch", { name: "Maintenance mode" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Public email address")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save contact details" })).not.toBeInTheDocument();
    maintenance.unmount();

    render(<SettingsManagement authHeaders={() => ({})} section="contact" />, {
      wrapper: createTestQueryClientWrapper(),
    });
    expect(await screen.findByLabelText("Public email address")).toBeInTheDocument();
    expect(screen.getByText("Contact details")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Maintenance mode" })).not.toBeInTheDocument();
  });

  it("asks before switching maintenance mode on, and not before switching it off", async () => {
    const saved: Record<string, unknown>[] = [];
    let current = initialSettings;
    server.use(
      http.get("/api/settings", () => HttpResponse.json(current)),
      http.put("/api/settings", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        saved.push(body);
        current = { ...current, ...body } as typeof current;
        return HttpResponse.json(current);
      }),
    );
    render(<SettingsManagement authHeaders={() => ({})} section="maintenance" />, {
      wrapper: createTestQueryClientWrapper(),
    });

    const toggle = await screen.findByRole("switch", { name: "Maintenance mode" });
    fireEvent.click(toggle);
    expect(await screen.findByText("Switch on maintenance mode?")).toBeInTheDocument();
    // Nothing is saved, and the switch stays off, until the confirmation.
    expect(saved).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Switch on maintenance mode?")).toBeNull());
    expect(saved).toEqual([]);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    fireEvent.click(await screen.findByRole("button", { name: "Switch on maintenance mode" }));
    await waitFor(() => expect(saved).toEqual([{ maintenance_mode: true }]));

    // Switching it off restores the site, so it goes straight through.
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(saved).toEqual([{ maintenance_mode: true }, { maintenance_mode: false }]),
    );
    expect(screen.queryByText("Switch on maintenance mode?")).toBeNull();
  });

  it("loads and saves all public contact settings without retrying", async () => {
    let submitted: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/settings", () => HttpResponse.json(initialSettings)),
      http.put("/api/settings", async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...initialSettings, ...submitted });
      }),
    );

    render(<SettingsManagement authHeaders={() => ({ Authorization: "Bearer test" })} />, {
      wrapper: createTestQueryClientWrapper(),
    });

    const email = await screen.findByLabelText("Public email address");
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Public telephone number"), {
      target: { value: "+32 59 44 55 66" },
    });
    fireEvent.change(screen.getByLabelText("Facebook URL"), {
      target: { value: "https://www.facebook.com/new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save contact details" }));

    await waitFor(() =>
      expect(submitted).toEqual({
        public_email: "new@example.com",
        public_phone: "+32 59 44 55 66",
        facebook_url: "https://www.facebook.com/new",
      }),
    );
  });
  it("preserves a dirty contact draft when maintenance mode or server contacts refresh", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    queryClient.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
    queryClient.setQueryData(queryKeys.admin.settings, initialSettings);
    render(<SettingsManagement authHeaders={() => ({})} />, { wrapper: Wrapper });
    const email = screen.getByLabelText("Public email address");
    fireEvent.change(email, { target: { value: "draft@example.com" } });
    await act(async () => {
      queryClient.setQueryData(queryKeys.admin.settings, {
        ...initialSettings,
        maintenance_mode: true,
        public_email: "server@example.com",
      });
    });
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Maintenance mode" })).toBeChecked(),
    );
    expect(email).toHaveValue("draft@example.com");
  });

  it("refreshes pristine contacts, including after a successful save", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    let stored = { ...initialSettings };
    server.use(
      http.get("/api/settings", () => HttpResponse.json(stored)),
      http.put("/api/settings", async ({ request }) => {
        stored = { ...stored, ...((await request.json()) as typeof initialSettings) };
        return HttpResponse.json(stored);
      }),
    );
    render(<SettingsManagement authHeaders={() => ({})} />, { wrapper: Wrapper });
    const email = await screen.findByLabelText("Public email address");
    await act(async () => {
      queryClient.setQueryData(queryKeys.admin.settings, {
        ...stored,
        public_email: "refreshed@example.com",
      });
    });
    await waitFor(() => expect(email).toHaveValue("refreshed@example.com"));
    fireEvent.change(email, { target: { value: "saved@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contact details" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save contact details" })).toBeEnabled(),
    );
    await waitFor(() => expect(stored.public_email).toBe("saved@example.com"));
    await act(async () => {
      queryClient.setQueryData(queryKeys.admin.settings, {
        ...stored,
        public_email: "later@example.com",
      });
    });
    await waitFor(() => expect(email).toHaveValue("later@example.com"));
  });

  it("preserves newer edits entered while a contact save is pending", async () => {
    const { Wrapper } = createTestQueryClientHarness();
    let finish!: () => void;
    let submitted = false;
    let stored = { ...initialSettings };
    server.use(
      http.get("/api/settings", () => HttpResponse.json(stored)),
      http.put("/api/settings", async ({ request }) => {
        const payload = (await request.json()) as Partial<typeof initialSettings>;
        submitted = true;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        stored = { ...stored, ...payload };
        return HttpResponse.json(stored);
      }),
    );
    render(<SettingsManagement authHeaders={() => ({})} />, { wrapper: Wrapper });
    const email = await screen.findByLabelText("Public email address");
    fireEvent.change(email, { target: { value: "submitted@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contact details" }));
    await waitFor(() => expect(submitted).toBe(true));
    fireEvent.change(email, { target: { value: "newer@example.com" } });
    await act(async () => finish());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save contact details" })).toBeEnabled(),
    );
    expect(email).toHaveValue("newer@example.com");
  });
});
