import { jsonResponse } from "@/mocks/response";
import { venueOut } from "@/mocks/data/builders";
import { editionOut } from "@/mocks/data/builders";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import EditionArtwork from "@/features/admin/editions/EditionArtwork";
import type { Edition } from "@/api-types";

import { server } from "@/mocks/server";
import { createTestQueryClient } from "../../../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });
const flyerPath = `/uploads/editions/${"a".repeat(32)}-${"b".repeat(64)}.jpg`;

function apiEdition(extra: Partial<Edition> = {}) {
  return editionOut({
    id: "2026-october",
    year: 2026,
    month: "october",
    edition_type: "festival",
    dates: [],
    venue: venueOut(),
    events: [],
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  });
}

function mount(edition: Edition, onUpdated = vi.fn()) {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <EditionArtwork edition={edition} authHeaders={authHeaders} onUpdated={onUpdated} />
    </QueryClientProvider>,
  );
  return onUpdated;
}

describe("EditionArtwork", () => {
  it("previews the defaults and uploads a flyer with authentication", async () => {
    let received: { file: File; authorization: string | null } | null = null;
    server.use(
      http.post("/api/editions/2026-october/artwork/flyer", async ({ request }) => {
        const body = await request.formData();
        received = {
          file: body.get("file") as File,
          authorization: request.headers.get("authorization"),
        };
        return jsonResponse<import("@/api-types").EditionOut>(
          apiEdition({ flyer_image: flyerPath }),
        );
      }),
    );
    const onUpdated = mount(editionOut(apiEdition()));
    expect(screen.getAllByText(/admin_edition_artwork_default_in_use/)).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /artwork_clear_slot/ })).not.toBeInTheDocument();
    const flyerUpload = screen.getByRole("button", {
      name: 'admin_edition_artwork_upload_slot({"slot":"admin_edition_artwork_flyer"})',
    });
    expect(flyerUpload).toBeDisabled();

    const input = screen.getAllByLabelText("admin_edition_artwork_flyer")[0]!;
    await userEvent.upload(input, new File(["image"], "flyer.png", { type: "image/png" }));
    await userEvent.click(flyerUpload);

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(received!.file.name).toBe("flyer.png");
    expect(received!.authorization).toBe("Bearer mock-access-token");
    expect(onUpdated.mock.calls[0]![0].flyer_image).toBe(flyerPath);
    expect(await screen.findByRole("status")).toHaveTextContent("admin_edition_artwork_uploaded");
  });

  it("shows the server's explanation for a rejected image and does not retry", async () => {
    let calls = 0;
    server.use(
      http.post("/api/editions/2026-october/artwork/share", () => {
        calls++;
        return HttpResponse.json(
          /* Fixture exception: error response; intentionally outside the success schema. */ {
            detail: "The share image must be an image of 1.91:1.",
          },
          { status: 422 },
        );
      }),
    );
    const onUpdated = mount(editionOut(apiEdition()));
    const input = screen.getAllByLabelText("admin_edition_artwork_share")[0]!;
    await userEvent.upload(input, new File(["image"], "share.png", { type: "image/png" }));
    await userEvent.click(
      screen.getByRole("button", {
        name: 'admin_edition_artwork_upload_slot({"slot":"admin_edition_artwork_share"})',
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("1.91:1");
    expect(calls).toBe(1);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("clears an uploaded slot", async () => {
    server.use(
      http.delete("/api/editions/2026-october/artwork/flyer", () =>
        jsonResponse<import("@/api-types").EditionOut>(apiEdition({ flyer_image: null })),
      ),
    );
    const onUpdated = mount(editionOut(apiEdition({ flyer_image: flyerPath })));
    expect(screen.getByAltText(/preview_alt.*flyer/)).toHaveAttribute("src", flyerPath);
    await userEvent.click(
      screen.getByRole("button", {
        name: 'admin_edition_artwork_clear_slot({"slot":"admin_edition_artwork_flyer"})',
      }),
    );

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(onUpdated.mock.calls[0]![0].flyer_image).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("admin_edition_artwork_cleared");
  });
});
