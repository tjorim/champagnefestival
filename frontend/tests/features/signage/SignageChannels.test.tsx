import { jsonResponse } from "@/mocks/response";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { http } from "msw/http";
import SignageChannels from "@/features/signage/SignageChannels";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import { setLocale } from "@/paraglide/runtime";
import { renderLocation } from "../../utils/locationRouter";
import { createTestQueryClientWrapper } from "../../utils/queryClient";

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
    http.get("/api/signage/channels", () =>
      jsonResponse<import("@/api-types").ChannelOut[]>(channels),
    ),
    http.get("/api/signage/slides", () => jsonResponse<import("@/api-types").SlideOut[]>([])),
    http.get("/api/signage/templates", () => jsonResponse<import("@/api-types").TemplateOut[]>([])),
    http.get("/api/editions", () =>
      jsonResponse<import("@/api-types").EditionOut[]>([
        {
          dates: [],
          venue: {
            id: "",
            name: "",
            address: "",
            city: "",
            postal_code: "",
            country: "",
            lat: 0,
            lng: 0,
            active: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
          events: [],
          organizations: [],
          producers: [],
          sponsors: [],
          vendors: [],
          co_organizer: null,
          flyer_image: null,
          hero_image: null,
          share_image: null,
          active: false,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          id: "march-2027",
          edition_type: "bourse",
          year: 2027,
          month: "march",
        },
      ]),
    ),
  );
});

afterEach(cleanup);

describe("SignageChannels", () => {
  it("adopts the channel named in the URL when the page loads", async () => {
    await renderLocation(
      <SignageChannels />,
      "/admin?signageChannel=channel-b",
      createTestQueryClientWrapper(),
    );

    expect(await screen.findByRole("heading", { name: /Bar screen/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview playlist" })).toBeEnabled();
  });

  it("labels each edition option with its edition type", async () => {
    await renderLocation(
      <SignageChannels />,
      "/admin?signageChannel=channel-a",
      createTestQueryClientWrapper(),
    );

    await userEvent.click(await screen.findByRole("button", { name: m.signage_channels_new() }));
    await userEvent.click(
      await screen.findByRole("combobox", { name: m.signage_channels_edition() }),
    );
    expect(
      await screen.findByRole("option", { name: `${m.admin_edition_type_bourse()} · March 2027` }),
    ).toBeVisible();
  });

  it("follows browser history between channels", async () => {
    const router = await renderLocation(
      <SignageChannels />,
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
