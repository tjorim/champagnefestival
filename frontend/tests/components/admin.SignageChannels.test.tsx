import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw/http";
import SignageChannels from "@/components/admin/SignageChannels";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import { renderLocation } from "../utils/locationRouter";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const channels = [
  {
    id: "channel-a",
    name: "Entrance screen",
    slug: "entrance",
    edition_id: "march-2027",
    active: true,
    epoch: "e1",
    revision: 1,
  },
  {
    id: "channel-b",
    name: "Bar screen",
    slug: "bar",
    edition_id: "march-2027",
    active: true,
    epoch: "e1",
    revision: 1,
  },
];

beforeEach(() => {
  setLocale("en", { reload: false });
  server.use(
    http.get("/api/signage/channels", () => HttpResponse.json(channels)),
    http.get("/api/signage/slides", () => HttpResponse.json([])),
    http.get("/api/signage/templates", () => HttpResponse.json([])),
    http.get("/api/editions", () =>
      HttpResponse.json([{ id: "march-2027", year: 2027, month: "March" }]),
    ),
  );
});

afterEach(cleanup);

describe("SignageChannels", () => {
  it("adopts the channel named in the URL when the page loads", async () => {
    await renderLocation(
      <SignageChannels authHeaders={authHeaders} />,
      "/admin?signageChannel=channel-b",
      createTestQueryClientWrapper(),
    );

    expect(await screen.findByRole("heading", { name: /Bar screen/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview playlist" })).toBeEnabled();
  });

  it("follows browser history between channels", async () => {
    const router = await renderLocation(
      <SignageChannels authHeaders={authHeaders} />,
      "/admin?signageChannel=channel-a",
      createTestQueryClientWrapper(),
    );
    expect(await screen.findByRole("heading", { name: /Entrance screen/ })).toBeVisible();

    await router.navigate({ to: ".", search: { signageChannel: "channel-b" } });
    await waitFor(() => expect(screen.getByRole("heading", { name: /Bar screen/ })).toBeVisible());

    router.history.back();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Entrance screen/ })).toBeVisible(),
    );
  });
});
