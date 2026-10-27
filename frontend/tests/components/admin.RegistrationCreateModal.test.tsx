import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw/http";
import RegistrationCreateModal from "@/components/admin/RegistrationCreateModal";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const ticket = {
  id: "prod-ticket",
  event_id: "evt-1",
  name: "Entry ticket",
  price: "15.00",
  category: "ticket",
  unit: "person",
  required: true,
  purchasable: true,
};
const extra = {
  id: "prod-extra",
  event_id: "evt-1",
  name: "Extra bottle",
  price: "40.00",
  category: "drink",
  unit: "item",
  required: false,
  purchasable: true,
};
const event = (products: unknown[]) => ({
  id: "evt-1",
  edition_id: "ed-1",
  title: "Friday gala",
  date: "2026-11-20",
  active: true,
  registration_required: true,
  products,
  order_questions: [],
});

const alice = {
  id: "person-1",
  name: "Alice Janssens",
  email: "alice@example.com",
  phone: "0470 11 22 33",
  registration_count: 2,
};

const createdRegistration = (body: Record<string, unknown>, amountDue: string | null) => ({
  id: "reg-1",
  person_id: body.person_id,
  person: { id: "person-1", name: "Alice Janssens", email: "alice@example.com", phone: "" },
  event_id: body.event_id,
  event: event([ticket]),
  guest_count: body.guest_count,
  order_items: [],
  amount_due: amountDue,
  notes: "",
  status: "confirmed",
  payment_status: "unpaid",
  checked_in: false,
  created_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
});

function useEvents(products: unknown[]) {
  server.use(http.get("/api/events", () => HttpResponse.json([event(products)])));
}

function usePeople(items: unknown[]) {
  server.use(
    http.get("/api/people", () =>
      HttpResponse.json({ items, total: items.length, limit: 200, page: 1 }),
    ),
  );
}

function renderModal(props: Partial<Parameters<typeof RegistrationCreateModal>[0]> = {}) {
  const onSaved = vi.fn();
  const onOpenBooking = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RegistrationCreateModal
        show
        authHeaders={() => ({ Authorization: "Bearer test" })}
        onSaved={onSaved}
        onOpenBooking={onOpenBooking}
        onHide={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSaved, onOpenBooking };
}

async function chooseEvent() {
  const select = await screen.findByRole("combobox", { name: /admin_event_label/ });
  await waitFor(() => expect(select).toBeEnabled());
  await userEvent.click(select);
  await userEvent.click(await screen.findByRole("option", { name: /Friday gala/ }));
}

async function choosePerson(query = "Alice") {
  await userEvent.type(screen.getByRole("combobox", { name: "admin_person_label" }), query);
  await userEvent.click(await screen.findByRole("option", { name: /Alice Janssens/ }));
}

describe("RegistrationCreateModal", () => {
  it("renders a disabled empty-state selector when no reservable events are available", async () => {
    let capturedRegistrationRequired: string | null = null;
    server.use(
      http.get("/api/events", ({ request }) => {
        capturedRegistrationRequired = new URL(request.url).searchParams.get(
          "registration_required",
        );
        return HttpResponse.json([]);
      }),
    );
    renderModal();

    const eventSelect = await screen.findByRole("combobox", { name: /admin_event_label/ });
    expect(capturedRegistrationRequired).toBe("true");
    expect(eventSelect).toBeDisabled();
    expect(eventSelect).toHaveTextContent("admin_content_edition_no_events");
  });

  it("uses debounced server search, selects by keyboard and clears the selected person", async () => {
    const queries: string[] = [];
    server.use(
      http.get("/api/people", ({ request }) => {
        queries.push(new URL(request.url).searchParams.get("q") ?? "");
        return HttpResponse.json({ items: [alice], total: 1, limit: 200, page: 1 });
      }),
    );
    renderModal();

    const input = screen.getByRole("combobox", { name: "admin_person_label" });
    await userEvent.type(input, "alternate spelling");
    const option = await screen.findByRole("option", { name: /Alice/ });
    expect(option).toHaveTextContent("alice@example.com");
    expect(queries).toContain("alternate spelling");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(input).toHaveValue("Alice Janssens"));
    await userEvent.click(screen.getByRole("button", { name: "admin_action_clear_selection" }));
    expect(input).toHaveValue("");
  });

  it("tells same-name people apart and marks the part that matched", async () => {
    usePeople([
      alice,
      {
        ...alice,
        id: "person-2",
        email: "alice.other@example.com",
        phone: "",
        registration_count: 0,
      },
      { id: "person-3", name: "Pauwels", email: "", phone: "", registration_count: 1 },
    ]);
    renderModal();

    await userEvent.type(screen.getByRole("combobox", { name: "admin_person_label" }), "Els");
    const options = await screen.findAllByRole("option");

    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("alice@example.com");
    expect(options[0]).toHaveTextContent('admin_registration_person_bookings({"count":2})');
    expect(options[1]).toHaveTextContent("alice.other@example.com");
    expect(options[1]).toHaveTextContent('admin_registration_person_bookings({"count":0})');
    expect(within(options.at(2) as HTMLElement).getByText("els")).toBeInTheDocument();
  });

  it("explains every missing required field on submit instead of staying silent", async () => {
    useEvents([ticket]);
    renderModal();
    await screen.findByRole("combobox", { name: /admin_event_label/ });

    expect(screen.getByText(/admin_event_label/)).toHaveTextContent("*");
    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));

    expect(screen.getByText("admin_registration_fix_before_create")).toBeInTheDocument();
    expect(screen.getByText("admin_registration_event_required")).toBeInTheDocument();
    expect(screen.getByText("admin_registration_person_required")).toBeInTheDocument();
  });

  it("books two required tickets and shows the total before creating", async () => {
    useEvents([ticket, extra]);
    usePeople([alice]);
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/registrations/admin", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(createdRegistration(body, "30.00"), { status: 201 });
      }),
    );
    const { onSaved } = renderModal();

    await chooseEvent();
    await choosePerson();
    const guests = screen.getByRole("spinbutton", { name: /admin_guests_count/ });
    await userEvent.clear(guests);
    await userEvent.type(guests, "2");

    expect(screen.getByRole("spinbutton", { name: /Entry ticket/ })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: /Extra bottle/ })).toHaveValue(0);
    expect(screen.getByText(/€30\.00/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(body).toMatchObject({
      person_id: "person-1",
      event_id: "evt-1",
      guest_count: 2,
      order_items: [{ product_id: "prod-ticket", quantity: 2 }],
    });
    expect(typeof body?.idempotency_key).toBe("string");
  });

  it("requires an explicit confirmation before creating an exempt booking with no products", async () => {
    useEvents([ticket]);
    usePeople([alice]);
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/registrations/admin", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(createdRegistration(body, null), { status: 201 });
      }),
    );
    const { onSaved } = renderModal();
    await chooseEvent();
    await choosePerson();

    const quantity = screen.getByRole("spinbutton", { name: /Entry ticket/ });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "0");
    expect(screen.getByText("admin_registration_exempt_warning")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));
    expect(screen.getByText("admin_registration_exempt_required")).toBeInTheDocument();
    expect(body).toBeUndefined();

    await userEvent.click(
      screen.getByRole("checkbox", { name: "admin_registration_exempt_confirm" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(body).toMatchObject({ order_items: [] });
  });

  it("rejects optional products without a required one", async () => {
    useEvents([ticket, extra]);
    usePeople([alice]);
    renderModal();
    await chooseEvent();
    await choosePerson();

    const ticketQuantity = screen.getByRole("spinbutton", { name: /Entry ticket/ });
    await userEvent.clear(ticketQuantity);
    await userEvent.type(ticketQuantity, "0");
    await userEvent.type(screen.getByRole("spinbutton", { name: /Extra bottle/ }), "1");
    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));

    expect(
      screen.getAllByText(/admin_registration_required_product_missing/).length,
    ).toBeGreaterThan(0);
  });

  it("adds a new person inline, keeps the draft and selects them for the booking", async () => {
    useEvents([ticket]);
    usePeople([]);
    const created: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/people", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        created.push(body);
        return HttpResponse.json(
          { id: "person-new", ...body, email: body.email ?? "", registration_count: 0 },
          { status: 201 },
        );
      }),
    );
    renderModal();
    await chooseEvent();
    await userEvent.type(screen.getByRole("textbox", { name: /admin_notes/ }), "Door booking");

    await userEvent.type(screen.getByRole("combobox", { name: "admin_person_label" }), "Zoë Nieuw");
    await userEvent.click(
      await screen.findByRole("button", {
        name: /admin_registration_person_add\(\{"name":"Zoë Nieuw"\}\)/,
      }),
    );

    expect(screen.getByRole("textbox", { name: /registration_name/ })).toHaveValue("Zoë Nieuw");
    await userEvent.type(
      screen.getByRole("textbox", { name: /registration_email/ }),
      "zoe@example.com",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "admin_registration_new_person_save" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "admin_person_label" })).toHaveValue("Zoë Nieuw"),
    );
    expect(created).toEqual([
      expect.objectContaining({ name: "Zoë Nieuw", email: "zoe@example.com" }),
    ]);
    expect(screen.getByRole("textbox", { name: /admin_notes/ })).toHaveValue("Door booking");
    expect(screen.getByText(/admin_registration_new_person_added/)).toBeInTheDocument();
  });

  it("offers an existing person instead of creating a duplicate", async () => {
    useEvents([ticket]);
    usePeople([alice]);
    renderModal();
    await chooseEvent();

    await userEvent.click(
      screen.getByRole("button", { name: "admin_registration_person_add_generic" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /registration_email/ }),
      "ALICE@example.com",
    );

    await userEvent.click(
      await screen.findByRole("button", {
        name: /admin_registration_use_person\(\{"name":"Alice Janssens"\}\)/,
      }),
    );

    expect(screen.getByRole("combobox", { name: "admin_person_label" })).toHaveValue(
      "Alice Janssens",
    );
  });

  it("lets Enter activate a duplicate's Use button instead of creating a person", async () => {
    useEvents([ticket]);
    usePeople([alice]);
    let posted = 0;
    server.use(
      http.post("/api/people", () => {
        posted += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderModal();
    await chooseEvent();

    await userEvent.click(
      screen.getByRole("button", { name: "admin_registration_person_add_generic" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /registration_email/ }),
      "ALICE@example.com",
    );
    (
      await screen.findByRole("button", {
        name: /admin_registration_use_person\(\{"name":"Alice Janssens"\}\)/,
      })
    ).focus();
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByRole("combobox", { name: "admin_person_label" })).toHaveValue(
      "Alice Janssens",
    );
    expect(posted).toBe(0);
  });

  it("keeps the draft after a failed create and retries with the same idempotency key", async () => {
    useEvents([ticket]);
    usePeople([alice]);
    const keys: unknown[] = [];
    let attempts = 0;
    server.use(
      http.post("/api/registrations/admin", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        keys.push(body.idempotency_key);
        attempts += 1;
        if (attempts === 1) return HttpResponse.error();
        return HttpResponse.json(createdRegistration(body, "15.00"), { status: 201 });
      }),
    );
    const { onSaved } = renderModal();
    await chooseEvent();
    await choosePerson();

    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));
    expect(await screen.findByText("admin_error_create_registration")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "admin_person_label" })).toHaveValue(
      "Alice Janssens",
    );

    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("offers payment and seating on the new booking after creating it", async () => {
    useEvents([ticket]);
    usePeople([alice]);
    server.use(
      http.post("/api/registrations/admin", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(createdRegistration(body, "15.00"), { status: 201 });
      }),
    );
    const { onOpenBooking } = renderModal();
    await chooseEvent();
    await choosePerson();
    await userEvent.click(screen.getByRole("button", { name: /admin_create_action/ }));

    expect(await screen.findByText(/admin_registration_created_total/)).toHaveTextContent("€15.00");
    expect(screen.getByText(/admin_registration_email_queued/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "admin_registration_open_booking" }));

    expect(onOpenBooking).toHaveBeenCalledWith(expect.objectContaining({ id: "reg-1" }));
  });
});
