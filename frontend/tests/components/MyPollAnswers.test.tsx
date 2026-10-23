import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import MyPollSection from "@/components/MyPollSection";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

function setup(closed = false) {
  const questions = [
    {
      id: "choice",
      kind: "single_choice",
      title: "Vervoer",
      closed,
      options: [{ id: "bus", label: "Bus" }],
      option_id: null,
    },
    { id: "text", kind: "free_text", title: "Suggestie", closed, text: null },
    { id: "rating", kind: "rating", title: "Score", closed, rating: null },
  ];
  const writes: unknown[] = [];
  server.use(
    http.get("/api/me/volunteer/poll", () =>
      HttpResponse.json({ edition_id: "edition", questions }),
    ),
    http.put("/api/me/volunteer/poll/questions/:id", async ({ request, params }) => {
      const body = await request.json();
      writes.push(body);
      Object.assign(
        questions.find((q) => q.id === params.id)!,
        body,
      );
      return HttpResponse.json({ edition_id: "edition", questions });
    }),
  );
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MyPollSection getAccessToken={() => "token"} />
    </QueryClientProvider>,
  );
  return writes;
}

describe("additional volunteer poll answers", () => {
  it("saves, displays and clears each typed answer through the API", async () => {
    const writes = setup();
    const user = userEvent.setup();
    const choice = await screen.findByRole("region", { name: "Vervoer" });
    const { within } = await import("@testing-library/react");
    await user.click(within(choice).getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Bus" }));
    await waitFor(() => expect(writes).toEqual([{ option_id: "bus" }]));
    expect(within(choice).getByRole("combobox")).toHaveTextContent("Bus");
    const text = screen.getByRole("textbox");
    await user.type(text, "  Meer soep  ");
    await user.click(screen.getByRole("button", { name: "poll_answer_save" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual({ text: "Meer soep" });
    await user.clear(text);
    await user.click(screen.getByRole("button", { name: "poll_answer_save" }));
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2]).toEqual({ text: null });
    const rating = screen.getByRole("region", { name: "Score" });
    await user.click(within(rating).getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /^5$/ }));
    await waitFor(() => expect(writes).toHaveLength(4));
    expect(writes[3]).toEqual({ rating: 5 });
    await user.click(within(rating).getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "poll_answer_none" }));
    await waitFor(() => expect(writes).toHaveLength(5));
    expect(writes[4]).toEqual({ rating: null });
    await user.click(within(choice).getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "poll_answer_none" }));
    await waitFor(() => expect(writes).toHaveLength(6));
    expect(writes[5]).toEqual({ option_id: null });
  });

  it("locks all inputs after closing", async () => {
    setup(true);
    const inputs = await screen.findAllByRole("combobox");
    for (const input of inputs) expect(input).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "poll_answer_save" })).toBeDisabled();
  });
});
