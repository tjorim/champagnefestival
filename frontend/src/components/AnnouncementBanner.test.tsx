import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnnouncementBanner from "./AnnouncementBanner";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderBanner(items: object[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(items))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementBanner />
    </QueryClientProvider>,
  );
}

describe("AnnouncementBanner", () => {
  it("renders ordinary announcements as static, non-live text", async () => {
    const view = renderBanner([
      { id: "one", text: "Entrance changed", level: "info", link_url: null, link_label: null },
    ]);
    await screen.findByText("Entrance changed");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "off");
    expect(view.container.querySelector("[aria-pressed]")).toBeNull();
  });

  it("announces an urgent message once with an alert live region", async () => {
    renderBanner([
      { id: "urgent", text: "Festival closing", level: "urgent", link_url: null, link_label: null },
    ]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Festival closing"));
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("refreshes scheduled announcements every minute", async () => {
    const mockedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("[]"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: "now", text: "Now visible", level: "info", link_url: null, link_label: null },
          ]),
        ),
      );
    vi.stubGlobal("fetch", mockedFetch);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={client}>
        <AnnouncementBanner />
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
