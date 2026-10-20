import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import OrderQuestionsEditor from "@/components/admin/OrderQuestionsEditor";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";
import { setLocale } from "@/paraglide/runtime";

const authHeaders = () => ({ Authorization: "Bearer test" });
describe("event order question configuration", () => {
  it("loads on demand and saves a translated question with a stable retry identity", async () => {
    setLocale("en", { reload: false });
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.get("/api/events/event", () => HttpResponse.json({ order_questions: [] })),
      http.put("/api/events/event/order-questions", async ({ request }) => {
        const body = (await request.json()) as { questions: unknown[] };
        bodies.push(body);
        return HttpResponse.json(body.questions);
      }),
    );
    const user = userEvent.setup();
    render(<OrderQuestionsEditor eventId="event" authHeaders={authHeaders} />, {
      wrapper: createTestQueryClientWrapper(),
    });
    await user.click(screen.getByRole("button", { name: "Order questions" }));
    await user.click(await screen.findByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Title (Dutch)"), { target: { value: "Opmerking" } });
    fireEvent.change(screen.getByLabelText("Title (English)"), { target: { value: "Comment" } });
    await user.click(screen.getByRole("button", { name: "Save order questions" }));
    await screen.findByText("Order questions saved.");
    await user.click(screen.getByRole("button", { name: "Save order questions" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toMatchObject({
      questions: [
        {
          kind: "free_text",
          title_nl: "Opmerking",
          title_en: "Comment",
          active: true,
          options: [],
        },
      ],
    });
  });
});
