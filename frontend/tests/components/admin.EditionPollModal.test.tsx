import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import EditionPollModal from "@/components/admin/EditionPollModal";
import type { Edition } from "@/components/admin/editionTypes";
import { server } from "@/mocks/server";
import { exportToCsv } from "@/utils/csvExport";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

vi.mock("@/utils/csvExport", () => ({ exportToCsv: vi.fn() }));

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const edition: Edition = {
  id: "2026-october",
  year: 2026,
  month: "october",
  editionType: "festival",
  dates: [],
  venue: { id: "venue-1", name: "MEC Staf Versluys", city: "Bredene", active: true },
  events: [],
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** A stored option as the admin API returns it. */
function option(
  id: string,
  label: string,
  totalQuantity = 0,
  volunteerCount = 0,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    question_id: "q-meals",
    edition_id: "2026-october",
    label,
    label_nl: label,
    label_fr: null,
    label_en: null,
    dietary_tags: [],
    sort_order: 0,
    total_quantity: totalQuantity,
    volunteer_count: volunteerCount,
    ...extra,
  };
}

/** A stored question as the admin API returns it. */
function question(
  id: string,
  kind: "yes_no" | "meals",
  title: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    edition_id: "2026-october",
    kind,
    title,
    title_nl: title,
    title_fr: null,
    title_en: null,
    description: "",
    description_nl: null,
    description_fr: null,
    description_en: null,
    sort_order: 0,
    closes_at: null,
    closed: false,
    options: [],
    answered_count: 0,
    yes_count: 0,
    no_count: 0,
    people_total: 0,
    ...extra,
  };
}

const dinner = () => question("q-dinner", "yes_no", "Eten op zondag?");
const meals = (options: Record<string, unknown>[] = []) =>
  question("q-meals", "meals", "Maaltijden", { options });

interface Backdrop {
  orders?: Record<string, unknown>;
  editions?: Record<string, unknown>[];
}

function renderModal(questions: Record<string, unknown>[], backdrop: Backdrop = {}) {
  server.use(
    http.get("/api/poll-questions", ({ request }) => {
      const editionId = new URL(request.url).searchParams.get("edition_id");
      return HttpResponse.json(questions.filter((q) => q.edition_id === editionId));
    }),
    http.get("/api/poll-questions/orders", () =>
      HttpResponse.json(
        backdrop.orders ?? {
          edition_id: "2026-october",
          questions: [],
          volunteers: [],
          volunteer_count: 0,
        },
      ),
    ),
    http.get("/api/editions", () => HttpResponse.json(backdrop.editions ?? [])),
  );
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <EditionPollModal show edition={edition} authHeaders={authHeaders} onHide={() => {}} />
    </QueryClientProvider>,
  );
}

const card = (title: string) => within(screen.getByRole("region", { name: title }));
const titleInput = (language: string, scope = screen) =>
  scope.getByLabelText(`admin_poll_question_title_in({"language":"admin_language_${language}"})`);

describe("EditionPollModal questions", () => {
  it("lists a yes/no and a meals question with what volunteers answered", async () => {
    renderModal([
      question("q-dinner", "yes_no", "Eten op zondag?", {
        answered_count: 3,
        yes_count: 2,
        no_count: 1,
        people_total: 5,
      }),
      meals([option("opt-1", "Vol-au-vent", 5, 3), option("opt-2", "Tomatensoep", 4, 2)]),
    ]);

    expect(await screen.findByRole("region", { name: "Eten op zondag?" })).toBeInTheDocument();
    expect(
      card("Eten op zondag?").getByText("admin_poll_question_kind_yes_no"),
    ).toBeInTheDocument();
    expect(
      card("Eten op zondag?").getByText('admin_poll_yes_no_summary({"yes":2,"people":5,"no":1})'),
    ).toBeInTheDocument();
    expect(card("Maaltijden").getByText("admin_poll_question_kind_meals")).toBeInTheDocument();
    expect(card("Maaltijden").getByText("Vol-au-vent")).toBeInTheDocument();
    expect(card("Maaltijden").getByText('admin_poll_total({"quantity":9})')).toBeInTheDocument();
  });

  it("adds a yes/no question and a meals question", async () => {
    const created: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/poll-questions", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        created.push(body);
        return HttpResponse.json(
          question(
            `q-new-${created.length}`,
            body.kind as "yes_no" | "meals",
            String(body.title_nl),
          ),
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderModal([]);

    expect(await screen.findByText("admin_poll_questions_empty")).toBeInTheDocument();
    await user.type(titleInput("nl"), "Toneel in december?");
    await user.type(titleInput("en"), "Play in December?");
    await user.click(screen.getByRole("button", { name: "admin_poll_question_add_button" }));
    await screen.findByRole("region", { name: "Toneel in december?" });
    expect(created[0]).toEqual({
      edition_id: "2026-october",
      kind: "yes_no",
      title_nl: "Toneel in december?",
      title_fr: null,
      title_en: "Play in December?",
      description_nl: null,
      description_fr: null,
      description_en: null,
    });

    await user.click(screen.getByLabelText("admin_poll_question_kind_label"));
    await user.click(await screen.findByRole("option", { name: "admin_poll_question_kind_meals" }));
    await user.type(titleInput("nl"), "Maaltijden");
    await user.click(screen.getByRole("button", { name: "admin_poll_question_add_button" }));
    await screen.findByRole("region", { name: "Maaltijden" });
    expect(created[1]).toMatchObject({ kind: "meals", title_nl: "Maaltijden" });
  });

  it("requires a Dutch title", async () => {
    const post = vi.fn();
    server.use(
      http.post("/api/poll-questions", () => {
        post();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderModal([]);

    await screen.findByText("admin_poll_questions_empty");
    await user.type(titleInput("en"), "Only English");
    await user.click(screen.getByRole("button", { name: "admin_poll_question_add_button" }));

    expect(await screen.findByText("admin_poll_question_title_required")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("edits the texts of a question", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put("/api/poll-questions/q-dinner", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(question("q-dinner", "yes_no", String(body.title_nl)));
      }),
    );
    const user = userEvent.setup();
    renderModal([dinner()]);

    const section = await screen.findByRole("region", { name: "Eten op zondag?" });
    await user.click(within(section).getByRole("button", { name: "admin_edit" }));
    const input = within(section).getByDisplayValue("Eten op zondag?");
    await user.clear(input);
    await user.type(input, "Eten we samen?");
    await user.click(within(section).getByRole("button", { name: "admin_save" }));

    await screen.findByRole("region", { name: "Eten we samen?" });
    expect(body).toMatchObject({ title_nl: "Eten we samen?", title_fr: null, title_en: null });
  });

  it("closes and reopens one question without touching the other", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    server.use(
      http.put("/api/poll-questions/:id", async ({ request, params }) => {
        const body = (await request.json()) as { closes_at: string | null };
        sent.push({ url: String(params.id), body });
        return HttpResponse.json(
          question(String(params.id), "yes_no", "Eten op zondag?", {
            closes_at: body.closes_at,
            closed: body.closes_at !== null && new Date(body.closes_at) <= new Date(),
          }),
        );
      }),
    );
    const user = userEvent.setup();
    renderModal([dinner(), question("q-play", "yes_no", "Toneel?")]);

    const section = await screen.findByRole("region", { name: "Eten op zondag?" });
    expect(within(section).getByText("admin_poll_status_open")).toBeInTheDocument();
    fireEvent.change(within(section).getByLabelText("admin_poll_closes_at_label"), {
      target: { value: "2099-10-01T10:00" },
    });
    await user.click(within(section).getByRole("button", { name: "admin_poll_closing_save" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      url: "q-dinner",
      body: { closes_at: new Date("2099-10-01T10:00").toISOString() },
    });

    await user.click(await within(section).findByRole("button", { name: "admin_poll_close_now" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(new Date(String(sent[1]!.body.closes_at)).getTime()).toBeLessThanOrEqual(Date.now());
    expect(await within(section).findByText("admin_poll_status_closed")).toBeInTheDocument();
    // The other question is still open.
    expect(card("Toneel?").getByText("admin_poll_status_open")).toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: "admin_poll_reopen" }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]).toEqual({ url: "q-dinner", body: { closes_at: null } });
    expect(await within(section).findByText("admin_poll_status_open")).toBeInTheDocument();
  });

  it("deletes an unanswered question after a plain confirmation", async () => {
    let deleteUrl = "";
    server.use(
      http.delete("/api/poll-questions/q-dinner", ({ request }) => {
        deleteUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderModal([dinner()]);

    await screen.findByRole("region", { name: "Eten op zondag?" });
    await user.click(screen.getByRole("button", { name: "admin_delete" }));
    expect(
      await screen.findByText('admin_poll_question_delete_body({"title":"Eten op zondag?"})'),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(deleteUrl).not.toBe(""));
    expect(deleteUrl).not.toContain("confirm_answers");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Eten op zondag?" })).not.toBeInTheDocument(),
    );
  });

  it("warns how many volunteers answered before removing their answers", async () => {
    let deleteUrl = "";
    server.use(
      http.delete("/api/poll-questions/q-dinner", ({ request }) => {
        deleteUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderModal([question("q-dinner", "yes_no", "Eten op zondag?", { answered_count: 4 })]);

    await screen.findByRole("region", { name: "Eten op zondag?" });
    await user.click(screen.getByRole("button", { name: "admin_delete" }));
    expect(
      await screen.findByText(
        'admin_poll_question_delete_body_in_use({"title":"Eten op zondag?","answered":4})',
      ),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(deleteUrl).toContain("confirm_answers=true"));
  });

  it("explains a refused deletion from the error code", async () => {
    server.use(
      http.delete("/api/poll-questions/q-dinner", () =>
        HttpResponse.json({ detail: "closed", code: "poll_question_closed" }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderModal([question("q-dinner", "yes_no", "Eten op zondag?", { answered_count: 1 })]);

    await screen.findByRole("region", { name: "Eten op zondag?" });
    await user.click(screen.getByRole("button", { name: "admin_delete" }));
    await user.click(await screen.findByRole("button", { name: "admin_action_confirm" }));

    expect(await screen.findByText("api_error_poll_question_closed")).toBeInTheDocument();
  });

  it("moves a question down by sending the whole new order", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/poll-questions/reorder", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([meals(), dinner()]);
      }),
    );
    const user = userEvent.setup();
    renderModal([dinner(), meals()]);

    await screen.findByRole("region", { name: "Eten op zondag?" });
    expect(
      screen.getByRole("button", {
        name: 'admin_poll_question_move_up({"title":"Eten op zondag?"})',
      }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", {
        name: 'admin_poll_question_move_down({"title":"Eten op zondag?"})',
      }),
    );

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ edition_id: "2026-october", ordered_ids: ["q-meals", "q-dinner"] });
  });

  it("copies the questions of another edition", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/poll-questions/copy", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([question("q-copied", "yes_no", "Gekopieerde vraag")], {
          status: 201,
        });
      }),
    );
    const user = userEvent.setup();
    renderModal([], {
      editions: [
        { id: "2026-october", year: 2026, month: "october", venue_id: "v", active: true },
        { id: "2025-october", year: 2025, month: "october", venue_id: "v", active: false },
      ],
    });

    await screen.findByText("admin_poll_questions_empty");
    await user.click(await screen.findByLabelText("admin_poll_copy_source_label"));
    await user.click(await screen.findByRole("option", { name: "2025-october" }));
    await user.click(screen.getByRole("button", { name: "admin_poll_copy_button" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ from_edition_id: "2025-october", to_edition_id: "2026-october" });
    expect(await screen.findByRole("region", { name: "Gekopieerde vraag" })).toBeInTheDocument();
    expect(screen.getByText('admin_poll_copied({"count":1})')).toBeInTheDocument();
  });
});

describe("EditionPollModal meal options", () => {
  it("shows translations and dietary tags next to the Dutch label", async () => {
    renderModal([
      meals([
        option("opt-1", "Stoofvlees", 0, 0, {
          label_fr: "Carbonade",
          label_en: "Beef stew",
          dietary_tags: ["lactose_free"],
        }),
      ]),
    ]);

    const row = (await screen.findByText("Stoofvlees")).closest("li")!;
    expect(screen.getByText("Carbonade · Beef stew")).toBeInTheDocument();
    expect(within(row).getByText("poll_dietary_lactose_free")).toBeInTheDocument();
  });

  it("adds an option to the question with a Dutch label, translations and tags", async () => {
    let created: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/poll-options", async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(option("opt-new", String(created.label_nl)), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderModal([meals()]);

    await screen.findByText("admin_poll_no_options");
    const section = card("Maaltijden");
    await user.type(
      section.getByLabelText('admin_poll_label_in({"language":"admin_language_nl"})'),
      "Pompoensoep",
    );
    await user.type(
      section.getByLabelText('admin_poll_label_in({"language":"admin_language_en"})'),
      "Pumpkin soup",
    );
    await user.click(section.getByRole("checkbox", { name: "poll_dietary_vegan" }));
    await user.click(section.getByRole("button", { name: "admin_poll_add_button" }));

    await waitFor(() => expect(section.getByText("Pompoensoep")).toBeInTheDocument());
    expect(created).toEqual({
      question_id: "q-meals",
      label_nl: "Pompoensoep",
      label_fr: null,
      label_en: "Pumpkin soup",
      dietary_tags: ["vegan"],
    });
  });

  it("requires a Dutch label", async () => {
    const post = vi.fn();
    server.use(
      http.post("/api/poll-options", () => {
        post();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderModal([meals()]);

    await screen.findByText("admin_poll_no_options");
    const section = card("Maaltijden");
    await user.type(
      section.getByLabelText('admin_poll_label_in({"language":"admin_language_en"})'),
      "Only English",
    );
    await user.click(section.getByRole("button", { name: "admin_poll_add_button" }));

    expect(await screen.findByText("admin_poll_label_required")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("edits an option's label in place", async () => {
    let updated: Record<string, unknown> | null = null;
    server.use(
      http.put("/api/poll-options/opt-1", async ({ request }) => {
        updated = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(option("opt-1", String(updated.label_nl), 5, 3));
      }),
    );
    const user = userEvent.setup();
    renderModal([meals([option("opt-1", "Vol-au-vent", 5, 3)])]);

    await screen.findByText("Vol-au-vent");
    const row = card("Maaltijden");
    await user.click(row.getAllByRole("button", { name: "admin_edit" }).at(-1)!);
    const input = screen.getByDisplayValue("Vol-au-vent");
    await user.clear(input);
    await user.type(input, "Stoofvlees");
    await user.click(row.getAllByRole("button", { name: "admin_save" }).at(-1)!);

    await waitFor(() => expect(screen.getByText("Stoofvlees")).toBeInTheDocument());
    expect(updated).toEqual({
      label_nl: "Stoofvlees",
      label_fr: null,
      label_en: null,
      dietary_tags: [],
    });
    expect(
      screen.getByText('admin_poll_ordered({"quantity":5,"volunteers":3})'),
    ).toBeInTheDocument();
  });

  it("warns how many volunteers picked an option before removing their picks", async () => {
    let deleteUrl = "";
    server.use(
      http.delete("/api/poll-options/opt-1", ({ request }) => {
        deleteUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderModal([meals([option("opt-1", "Vol-au-vent", 5, 3)])]);

    await screen.findByText("Vol-au-vent");
    const row = screen.getByText("Vol-au-vent").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "admin_delete" }));
    expect(
      await screen.findByText(
        'admin_poll_delete_body_in_use({"label":"Vol-au-vent","volunteers":3,"quantity":5})',
      ),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(deleteUrl).toContain("confirm_selections=true"));
  });

  it("moves an option down by sending the whole new order", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/poll-options/reorder", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([option("opt-2", "Tomatensoep"), option("opt-1", "Vol-au-vent")]);
      }),
    );
    const user = userEvent.setup();
    renderModal([meals([option("opt-1", "Vol-au-vent"), option("opt-2", "Tomatensoep")])]);

    await screen.findByText("Vol-au-vent");
    await user.click(
      screen.getByRole("button", { name: 'admin_poll_move_down({"label":"Vol-au-vent"})' }),
    );

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ question_id: "q-meals", ordered_ids: ["opt-2", "opt-1"] });
  });
});

describe("EditionPollModal answers", () => {
  const orders = {
    edition_id: "2026-october",
    questions: [
      {
        id: "q-dinner",
        kind: "yes_no",
        title: "Eten op zondag?",
        closed: false,
        options: [],
        answered_count: 2,
        yes_count: 1,
        no_count: 1,
        people_total: 3,
      },
      {
        id: "q-meals",
        kind: "meals",
        title: "Maaltijden",
        closed: false,
        options: [{ id: "opt-1", label: "Soep", dietary_tags: [] }],
        answered_count: 1,
        yes_count: 0,
        no_count: 0,
        people_total: 0,
      },
    ],
    volunteers: [
      {
        volunteer_id: "a",
        name: "Rik Cooleman",
        note: null,
        answered_question_ids: ["q-dinner"],
        selections: [],
        attendance: [{ question_id: "q-dinner", attending: false, people: 0 }],
      },
      {
        volunteer_id: "b",
        name: "Sofie De Smet",
        note: "Geen noten",
        answered_question_ids: ["q-dinner", "q-meals"],
        selections: [{ option_id: "opt-1", quantity: 2 }],
        attendance: [{ question_id: "q-dinner", attending: true, people: 3 }],
      },
      {
        volunteer_id: "c",
        name: "Nele Peeters",
        note: null,
        answered_question_ids: [],
        selections: [],
        attendance: [],
      },
    ],
    volunteer_count: 3,
  };

  it("shows who answered what, flags volunteers without answers and exports it", async () => {
    const user = userEvent.setup();
    renderModal([dinner(), meals([option("opt-1", "Soep")])], { orders });

    expect(await screen.findByText("Sofie De Smet")).toBeInTheDocument();
    expect(
      screen.getByText(/admin_poll_orders_answered\(\{"answered":2,"total":3\}\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("admin_poll_orders_none")).toBeInTheDocument();
    expect(screen.getByText("Geen noten")).toBeInTheDocument();
    expect(
      screen.getByText('poll_answer_yes (admin_poll_orders_people({"count":3}))'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "admin_poll_orders_export" }));
    expect(exportToCsv).toHaveBeenCalledWith("volunteer-poll-2026-october.csv", [
      {
        admin_poll_orders_volunteer: "Rik Cooleman",
        "Eten op zondag?": "poll_answer_no",
        "Maaltijden: Soep": "",
        admin_poll_orders_note: "",
      },
      {
        admin_poll_orders_volunteer: "Sofie De Smet",
        "Eten op zondag?": 'poll_answer_yes (admin_poll_orders_people({"count":3}))',
        "Maaltijden: Soep": "2",
        admin_poll_orders_note: "Geen noten",
      },
      {
        admin_poll_orders_volunteer: "Nele Peeters",
        "Eten op zondag?": "",
        "Maaltijden: Soep": "",
        admin_poll_orders_note: "",
      },
    ]);
  });

  it("registers a yes with a number of people and meal picks after a confirmation", async () => {
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.put("/api/poll-questions/orders/:volunteerId", async ({ request }) => {
        sent = { url: request.url, body: (await request.json()) as Record<string, unknown> };
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderModal([dinner(), meals([option("opt-1", "Soep")])], { orders });

    await screen.findByText("Nele Peeters");
    const row = screen.getByText("Nele Peeters").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "admin_poll_orders_enter" }));
    expect(
      await screen.findByText('admin_poll_order_edit_title({"name":"Nele Peeters"})'),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("admin_poll_order_answer_label"));
    await user.click(await screen.findByRole("option", { name: "poll_answer_yes" }));
    const people = await screen.findByLabelText(
      'admin_poll_order_people_label({"title":"Eten op zondag?"})',
    );
    fireEvent.change(people, { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Soep"), { target: { value: "3" } });
    await user.type(screen.getByLabelText("admin_poll_orders_note"), "Vegetarisch");
    await user.click(screen.getByRole("button", { name: "admin_poll_order_save" }));

    // Nothing is sent before the admin confirms.
    expect(
      await screen.findByText('admin_poll_order_confirm_body({"name":"Nele Peeters"})'),
    ).toBeInTheDocument();
    expect(sent).toBeNull();
    await user.click(screen.getByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.url).toContain("/api/poll-questions/orders/c?edition_id=2026-october");
    expect(sent!.body).toEqual({
      selections: [{ option_id: "opt-1", quantity: 3 }],
      attendance: [{ question_id: "q-dinner", attending: true, people: 4 }],
      note: "Vegetarisch",
      confirm_closed: false,
    });
  });

  it("prefills an existing answer and asks for stronger confirmation when a question has closed", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put("/api/poll-questions/orders/:volunteerId", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    const closedOrders = {
      ...orders,
      questions: orders.questions.map((q) => (q.id === "q-dinner" ? { ...q, closed: true } : q)),
    };
    const user = userEvent.setup();
    renderModal([dinner(), meals([option("opt-1", "Soep")])], { orders: closedOrders });

    await screen.findByText("Sofie De Smet");
    const row = screen.getByText("Sofie De Smet").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "admin_poll_orders_edit" }));
    expect(await screen.findByText("admin_poll_order_closed_warning")).toBeInTheDocument();
    expect(screen.getByLabelText("Soep")).toHaveValue(2);
    expect(
      screen.getByLabelText('admin_poll_order_people_label({"title":"Eten op zondag?"})'),
    ).toHaveValue(3);
    expect(screen.getByLabelText("admin_poll_orders_note")).toHaveValue("Geen noten");

    await user.click(screen.getByRole("button", { name: "admin_poll_order_save" }));
    expect(
      await screen.findByText('admin_poll_order_confirm_body_closed({"name":"Sofie De Smet"})'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "admin_action_confirm" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      selections: [{ option_id: "opt-1", quantity: 2 }],
      attendance: [{ question_id: "q-dinner", attending: true, people: 3 }],
      note: "Geen noten",
      confirm_closed: true,
    });
  });

  it("sends nothing when the confirmation is declined", async () => {
    const put = vi.fn();
    server.use(
      http.put("/api/poll-questions/orders/:volunteerId", () => {
        put();
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderModal([dinner()], { orders });

    await screen.findByText("Nele Peeters");
    const row = screen.getByText("Nele Peeters").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "admin_poll_orders_enter" }));
    await user.click(await screen.findByRole("button", { name: "admin_poll_order_save" }));
    await screen.findByText('admin_poll_order_confirm_body({"name":"Nele Peeters"})');
    await user.click(screen.getByRole("button", { name: "admin_action_cancel" }));

    expect(put).not.toHaveBeenCalled();
  });
});
