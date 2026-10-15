import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import AnnouncementsSection from "@/components/admin/AnnouncementsSection";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { createTestQueryClientWrapper } from "../utils/queryClient";

beforeEach(() => {
  setLocale("en", { reload: false });
  server.use(
    http.get("/api/announcements", () => HttpResponse.json([])),
    http.get("/api/composer", () => HttpResponse.json([])),
  );
});

afterEach(cleanup);

describe("AnnouncementsSection", () => {
  it("offers the announcements and the composer as tabs of one section", async () => {
    render(<AnnouncementsSection authHeaders={() => ({ Authorization: "Bearer test" })} />, {
      wrapper: createTestQueryClientWrapper(),
    });

    const announcements = screen.getByRole("tab", { name: "Announcements" });
    const compose = screen.getByRole("tab", { name: "Compose & send" });
    expect(announcements).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { level: 2, name: "Announcements" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Compose & send" }),
    ).not.toBeInTheDocument();

    fireEvent.click(compose);

    expect(compose).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { level: 2, name: "Compose & send" }),
    ).toBeInTheDocument();
  });
});
