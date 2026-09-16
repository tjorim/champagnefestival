import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import ScratchpadManagement from "@/components/admin/ScratchpadManagement";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

describe("ScratchpadManagement", () => {
  it("loads existing content, saves an edit, and shows a confirmation", async () => {
    let submitted: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/editions/edition-1/scratchpad", () =>
        HttpResponse.json({ content: "Fri: bar", updated_at: "2026-09-01T00:00:00Z" }),
      ),
      http.put("/api/editions/edition-1/scratchpad", async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          content: submitted.content,
          updated_at: "2026-09-02T00:00:00Z",
        });
      }),
    );

    render(
      <ScratchpadManagement
        authHeaders={() => ({ Authorization: "Bearer test" })}
        editionId="edition-1"
      />,
      { wrapper: createTestQueryClientWrapper() },
    );

    const textarea = await screen.findByPlaceholderText("Write anything here…");
    expect(textarea).toHaveValue("Fri: bar");

    fireEvent.change(textarea, { target: { value: "Fri: bar\nSat: serving" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(submitted).toEqual({ content: "Fri: bar\nSat: serving" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("disables Save until the content changes", async () => {
    server.use(
      http.get("/api/editions/edition-1/scratchpad", () =>
        HttpResponse.json({ content: "existing note", updated_at: "2026-09-01T00:00:00Z" }),
      ),
    );

    render(
      <ScratchpadManagement
        authHeaders={() => ({ Authorization: "Bearer test" })}
        editionId="edition-1"
      />,
      { wrapper: createTestQueryClientWrapper() },
    );

    const textarea = await screen.findByPlaceholderText("Write anything here…");
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "existing note, updated" } });
    expect(saveButton).not.toBeDisabled();
  });

  it("shows an error alert when saving fails", async () => {
    server.use(
      http.get("/api/editions/edition-1/scratchpad", () =>
        HttpResponse.json({ content: "", updated_at: "2026-09-01T00:00:00Z" }),
      ),
      http.put("/api/editions/edition-1/scratchpad", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );

    render(
      <ScratchpadManagement
        authHeaders={() => ({ Authorization: "Bearer test" })}
        editionId="edition-1"
      />,
      { wrapper: createTestQueryClientWrapper() },
    );

    const textarea = await screen.findByPlaceholderText("Write anything here…");
    fireEvent.change(textarea, { target: { value: "a new note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("shows a no-active-edition message and skips the fetch when editionId is empty", () => {
    render(
      <ScratchpadManagement authHeaders={() => ({ Authorization: "Bearer test" })} editionId="" />,
      { wrapper: createTestQueryClientWrapper() },
    );

    expect(
      screen.getByText(
        "No active edition yet — the scratchpad will be available once one is set up.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Write anything here…")).not.toBeInTheDocument();
  });
});
