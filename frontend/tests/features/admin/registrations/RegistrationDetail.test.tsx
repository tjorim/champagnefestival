import { productOut } from "@/mocks/data/builders";
import { eventOut } from "@/mocks/data/builders";
import { readAdminOptions } from "../../../utils/adminSelect";
import { selectAdminOption } from "../../../utils/adminSelect";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RegistrationDetail from "@/features/admin/registrations/RegistrationDetail";
import type { FloorTable } from "@/api-types";
import { NO_PRODUCT_TRANSLATIONS } from "@/types/event";
import type { Registration } from "@/types/registration";
import { registrationRow } from "../../../utils/registrationFixtures";
import { createTestQueryClientWrapper } from "../../../utils/queryClient";
import { noEventTranslations } from "../../../utils/eventFixtures";

vi.mock("@/paraglide/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/paraglide/runtime")>()),
  getLocale: () => "en",
}));

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const { fetchPaymentTransactions } = vi.hoisted(() => ({
  fetchPaymentTransactions: vi.fn(),
}));

vi.mock("@/lib/api/adminFetch", () => ({ fetchPaymentTransactions }));

const tables: FloorTable[] = [
  {
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    event_id: "event-1",
    id: "table-1",
    name: "Table 10",
    capacity: 8,
    x: 10,
    y: 10,
    table_type_id: "type-1",
    rotation: 0,
    layout_id: "layout-1",
    registration_ids: [],
  },
  {
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    event_id: "event-1",
    id: "table-2",
    name: "Table 2",
    capacity: 6,
    x: 20,
    y: 20,
    table_type_id: "type-1",
    rotation: 0,
    layout_id: "layout-1",
    registration_ids: ["reg-1"],
  },
];

function buildRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    ...registrationRow(),
    id: "reg-1",
    person_id: "person-1",
    person: {
      id: "person-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+32 470 00 00 00",
      preferred_language: null,
    },
    event_id: "event-1",
    event: eventOut({
      id: "event-1",
      edition_id: "edition-1",
      ...noEventTranslations,
      title: "Grand Tasting",
      description: "",
      date: "2026-05-01",
      start_time: "18:00",
      category: "tasting",
      products: [],
      registration_required: true,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      edition: {
        id: "edition-1",
        year: 2026,
        month: "may",
        edition_type: "festival",
        active: true,
      },
    }),
    guest_count: 2,
    order_items: [
      {
        product_id: "prod-1",
        name: "Brut Reserve",
        name_nl: null,
        name_fr: null,
        name_en: null,
        quantity: 3,
        delivered_quantity: 1,
        price: 25,
        category: "champagne",
        delivered: false,
        included_quantity: 0,
        visible: true,
      },
    ],
    notes: "Please seat near the window. Wheelchair access needed.",

    status: "confirmed",
    payment_status: "paid",
    amount_due: "75.00",
    amount_paid: "75.00",
    checked_in: false,
    strap_issued: false,
    check_in_token: "token-abc",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderDetail(props: Partial<React.ComponentProps<typeof RegistrationDetail>> = {}) {
  const onClose = vi.fn();
  const onToggleDelivered = vi.fn();
  const onCheckIn = vi.fn();
  const onIssueStrap = vi.fn();
  const onMergeDuplicate = vi.fn();
  const onAssignTable = vi.fn();
  const Wrapper = createTestQueryClientWrapper();

  render(
    <Wrapper>
      <RegistrationDetail
        registration={buildRegistration()}
        authHeaders={() => ({})}
        baseUrl="https://example.com"
        onClose={onClose}
        onToggleDelivered={onToggleDelivered}
        onCheckIn={onCheckIn}
        onIssueStrap={onIssueStrap}
        tables={tables}
        onMergeDuplicate={onMergeDuplicate}
        {...props}
      />
    </Wrapper>,
  );

  return { onClose, onToggleDelivered, onCheckIn, onIssueStrap, onMergeDuplicate, onAssignTable };
}

describe("RegistrationDetail", () => {
  it("renders nothing when registration is null", async () => {
    render(
      <RegistrationDetail
        registration={null}
        authHeaders={() => ({})}
        baseUrl="https://example.com"
        onClose={vi.fn()}
        onToggleDelivered={vi.fn()}
        onCheckIn={vi.fn()}
        onIssueStrap={vi.fn()}
        tables={[]}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders guest info from the registration", async () => {
    renderDetail();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();

    const emailLink = screen.getByRole("link", { name: "jane@example.com" });
    expect(emailLink).toHaveAttribute("href", "mailto:jane@example.com");

    expect(screen.getByText("+32 470 00 00 00")).toBeInTheDocument();
    expect(screen.getByLabelText("admin_guests_count")).toHaveTextContent("2");
    expect(screen.getByText("Grand Tasting")).toBeInTheDocument();
    expect(
      screen.getByText("Please seat near the window. Wheelchair access needed."),
    ).toBeInTheDocument();
  });

  it("keeps saved payment figures separate from the projected order total", () => {
    renderDetail({ onSaveBooking: vi.fn() });
    const saved = screen.getByText("admin_inventory_paid: €75.00 · admin_booking_balance: €0.00");
    expect(screen.queryByText(/admin_booking_total/)).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "admin_booking_quantity Brut Reserve" }),
      {
        target: { value: "4" },
      },
    );
    expect(screen.getByText("admin_booking_total: €100.00")).toBeInTheDocument();
    expect(saved).toHaveTextContent("admin_inventory_paid: €75.00 · admin_booking_balance: €0.00");
  });

  it("hides notes when absent", async () => {
    renderDetail({
      registration: buildRegistration({ notes: "" }),
    });

    expect(screen.queryByText("Please seat near the window.")).not.toBeInTheDocument();
    expect(screen.queryByText("Wheelchair access needed.")).not.toBeInTheDocument();
  });

  it("renders order-item rows with delivered/remaining badges for festival registrations", async () => {
    renderDetail();

    expect(screen.getByText("Brut Reserve")).toBeInTheDocument();
    expect(screen.getByText("admin_bottle_delivered: 1/3")).toBeInTheDocument();
    expect(screen.getByText("admin_bottle_not_delivered: 2")).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "admin_bottle_delivered Brut Reserve" }),
    ).toHaveValue(1);
  });

  it("updates delivered order-item quantities from the numeric input", async () => {
    const { onToggleDelivered } = renderDetail();

    const quantityInput = screen.getByRole("spinbutton", {
      name: "admin_bottle_delivered Brut Reserve",
    });

    fireEvent.change(quantityInput, {
      target: { value: "3" },
    });
    fireEvent.blur(quantityInput);

    expect(onToggleDelivered).toHaveBeenCalledWith(
      "reg-1",
      expect.arrayContaining([
        expect.objectContaining({
          delivered_quantity: 3,
          delivered: true,
        }),
      ]),
    );
  });

  it("keeps a whole-table booking partially allocated without inventing a companion count", async () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        booked_table_quantity: 3,
        allocations: [{ table_id: "table-1", guest_count: 0, exclusive: true }],
      }),
    });
    expect(screen.getByText(/admin_allocation_table_progress/)).toHaveTextContent(
      '"assigned":1,"total":3',
    );
    fireEvent.click(screen.getByRole("button", { name: "admin_allocation_add" }));
    const selectors = screen.getAllByRole("combobox", { name: "admin_inventory_unit_table" });
    expect(
      within(selectors[1]!).queryByRole("option", { name: /Table 10/ }),
    ).not.toBeInTheDocument();
    await selectAdminOption(selectors[1]!, "table-2");
    fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
    await waitFor(() =>
      expect(onSaveBooking).toHaveBeenCalledWith(
        "reg-1",
        expect.objectContaining({
          allocations: [
            { table_id: "table-1", guest_count: 0, exclusive: true },
            { table_id: "table-2", guest_count: 0, exclusive: true },
          ],
        }),
      ),
    );
  });

  it("records actual guest counts when splitting a booking", async () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        guest_count: 6,
        allocations: [
          { table_id: "table-1", guest_count: 4, exclusive: false },
          { table_id: "table-2", guest_count: 2, exclusive: false },
        ],
      }),
    });
    expect(screen.getByText(/admin_allocation_progress/)).toHaveTextContent(
      '"assigned":6,"total":6',
    );
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "admin_guests_count" })[2]!, {
      target: { value: "1" },
    });
    expect(screen.getByText(/admin_allocation_progress/)).toHaveTextContent(
      '"assigned":5,"total":6',
    );
    fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
    await waitFor(() =>
      expect(onSaveBooking).toHaveBeenCalledWith(
        "reg-1",
        expect.objectContaining({
          allocations: [
            { table_id: "table-1", guest_count: 4, exclusive: false },
            { table_id: "table-2", guest_count: 1, exclusive: false },
          ],
        }),
      ),
    );
  });

  it("saves table allocations explicitly from the detail modal", async () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        allocations: [{ table_id: "table-2", guest_count: 2, exclusive: false }],
      }),
    });

    const select = screen.getByRole("combobox", { name: "admin_inventory_unit_table" });
    expect(select).toHaveTextContent("Table 2");
    expect((await readAdminOptions(select)).map((option) => option.label)).toEqual([
      "admin_unassigned",
      'Table 2 (admin_table_capacity_remaining({"count":6}))',
      'Table 10 (admin_table_capacity_remaining({"count":8}))',
    ]);

    await selectAdminOption(select, "table-1");

    expect(onSaveBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
    await waitFor(() =>
      expect(onSaveBooking).toHaveBeenCalledWith(
        "reg-1",
        expect.objectContaining({
          allocations: [{ table_id: "table-1", guest_count: 2, exclusive: false }],
        }),
      ),
    );
  });

  it("shows remaining seats, not total capacity, when another booking already occupies a table", async () => {
    const otherRegistration = buildRegistration({
      id: "reg-2",
      allocations: [{ table_id: "table-1", guest_count: 3, exclusive: false }],
    });
    renderDetail({
      onSaveBooking: vi.fn().mockResolvedValue(undefined),
      registration: buildRegistration({
        allocations: [{ table_id: "table-2", guest_count: 2, exclusive: false }],
      }),
      registrations: [
        buildRegistration({
          allocations: [{ table_id: "table-2", guest_count: 2, exclusive: false }],
        }),
        otherRegistration,
      ],
    });

    const select = screen.getByRole("combobox", { name: "admin_inventory_unit_table" });
    expect((await readAdminOptions(select)).map((option) => option.label)).toEqual([
      "admin_unassigned",
      'Table 2 (admin_table_capacity_remaining({"count":6}))',
      // Table 10 has capacity 8; reg-2 (a different registration) occupies 3 of them.
      'Table 10 (admin_table_capacity_remaining({"count":5}))',
    ]);
  });

  it("disables a hidden product's quantity input when it was only ever included, never purchased standalone", async () => {
    // A hidden product never appears in `event.products` (the admin API
    // filters those out too — see product_to_dict/event_to_summary_dict),
    // so BookingEditor synthesizes a `purchasable: false` stand-in for it
    // from the order item itself. Reached only through a package bundle,
    // that order item has quantity === includedQuantity — its input must
    // stay disabled, or an admin could turn it into a genuine standalone
    // order the server would then (incorrectly, absent this guard) accept
    // because the product id already appears in the booking's prior items.
    renderDetail({
      onSaveBooking: vi.fn().mockResolvedValue(undefined),
      registration: buildRegistration({
        order_items: [
          {
            product_id: "napkin",
            name: "Napkin",
            name_nl: null,
            name_fr: null,
            name_en: null,
            quantity: 1,
            included_quantity: 1,
            delivered_quantity: 0,
            delivered: false,
            price: 0.5,
            category: "other",
            visible: false,
          },
        ],
      }),
    });
    expect(
      screen.getByRole("spinbutton", { name: "admin_booking_quantity Napkin" }),
    ).toBeDisabled();
  });

  it("keeps a hidden product's quantity input editable when it has a genuine prior standalone quantity", async () => {
    renderDetail({
      onSaveBooking: vi.fn().mockResolvedValue(undefined),
      registration: buildRegistration({
        order_items: [
          {
            product_id: "snack",
            name: "Snack",
            name_nl: null,
            name_fr: null,
            name_en: null,
            quantity: 2,
            included_quantity: 0,
            delivered_quantity: 0,
            delivered: false,
            price: 2,
            category: "other",
            visible: true,
          },
        ],
      }),
    });
    expect(
      screen.getByRole("spinbutton", { name: "admin_booking_quantity Snack" }),
    ).not.toBeDisabled();
  });

  it("previews a table quantity reduction and saves the chosen release", async () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    const tableProduct = {
      ...productOut(),
      id: "table-product",
      event_id: "event-1",
      ...NO_PRODUCT_TRANSLATIONS,
      name: "Bourse table",
      description: "",
      price: "50.00",
      category: "other" as const,
      unit: "table" as const,
      purchasable: true,
      required: false,
      created_at: "",
      updated_at: "",
    };
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        amount_due: "100.00",
        amount_paid: "100.00",
        order_items: [
          {
            product_id: tableProduct.id,
            name: tableProduct.name,
            name_nl: null,
            name_fr: null,
            name_en: null,
            quantity: 2,
            included_quantity: 0,
            delivered_quantity: 0,
            delivered: false,
            price: 50,
            category: "other",
            visible: true,
          },
        ],
        booked_table_quantity: 2,
        allocations: [
          { table_id: "table-1", guest_count: 0, exclusive: true },
          { table_id: "table-2", guest_count: 0, exclusive: true },
        ],
        event: eventOut({ ...buildRegistration().event!, products: [tableProduct] }),
      }),
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "admin_booking_quantity Bourse table" }),
      {
        target: { value: "1" },
      },
    );
    expect(screen.getByText(/admin_booking_release_tables/)).toBeInTheDocument();
    expect(screen.getByText("admin_booking_total: €50.00")).toBeInTheDocument();
    expect(screen.getByText("admin_booking_projected_refund: €50.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "admin_booking_save_all" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "admin_inventory_remove" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
    await waitFor(() =>
      expect(onSaveBooking).toHaveBeenCalledWith(
        "reg-1",
        expect.objectContaining({
          quantities: { "table-product": 1 },
          allocations: [{ table_id: "table-1", guest_count: 0, exclusive: true }],
        }),
      ),
    );
  });

  it("records a payment transaction from the ledger's add-transaction form", async () => {
    fetchPaymentTransactions.mockResolvedValue([]);
    const onAddTransaction = vi.fn().mockResolvedValue(undefined);
    renderDetail({ onSaveBooking: vi.fn(), onAddTransaction });

    fireEvent.click(screen.getByRole("button", { name: "admin_payment_history_show" }));
    await waitFor(() =>
      expect(fetchPaymentTransactions).toHaveBeenCalledWith(expect.any(Function), "reg-1"),
    );
    await waitFor(() =>
      expect(screen.getByText("admin_payment_history_empty")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "admin_payment_amount_label" }), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin_payment_record" }));

    await waitFor(() => expect(onAddTransaction).toHaveBeenCalledTimes(1));
    expect(onAddTransaction).toHaveBeenCalledWith(
      "reg-1",
      expect.objectContaining({
        amount: 42,
        idempotency_key: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ),
      }),
    );
  });

  it("hides table assignment for simple RSVP (non-festival) registrations", async () => {
    renderDetail({
      registration: buildRegistration({
        event: eventOut({
          id: "event-2",
          edition_id: "edition-2",
          ...noEventTranslations,
          title: "Bourse Meetup",
          description: "",
          date: "2026-05-01",
          start_time: "18:00",
          category: "bourse",
          products: [],
          registration_required: true,
          active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          edition: {
            id: "edition-2",
            year: 2026,
            month: "may",
            edition_type: "bourse",
            active: true,
          },
        }),
      }),
    });

    expect(
      screen.queryByRole("combobox", { name: "admin_action_assign_table" }),
    ).not.toBeInTheDocument();
  });

  it("hides order items and strap section for simple RSVP (non-festival) registrations", async () => {
    renderDetail({
      registration: buildRegistration({
        event: eventOut({
          id: "event-2",
          edition_id: "edition-2",
          ...noEventTranslations,
          title: "Bourse Meetup",
          description: "",
          date: "2026-05-01",
          start_time: "18:00",
          category: "bourse",
          products: [],
          registration_required: true,
          active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          edition: {
            id: "edition-2",
            year: 2026,
            month: "may",
            edition_type: "bourse",
            active: true,
          },
        }),
      }),
    });

    expect(screen.queryByText("Brut Reserve")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /admin_issue_strap/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/admin_strap_issued|admin_strap_not_issued/)).not.toBeInTheDocument();
  });

  it("shows the check-in button when not checked in and calls onCheckIn on click", async () => {
    const { onCheckIn } = renderDetail({
      registration: buildRegistration({ checked_in: false }),
    });

    const checkInButton = screen.getByRole("button", { name: /admin_mark_checked_in/ });
    fireEvent.click(checkInButton);

    expect(onCheckIn).toHaveBeenCalledWith("reg-1");
  });

  it("hides the check-in button and shows the checked-in badge when already checked in", async () => {
    renderDetail({
      registration: buildRegistration({ checked_in: true }),
    });

    expect(screen.queryByRole("button", { name: /admin_mark_checked_in/ })).not.toBeInTheDocument();
    expect(screen.getByText("admin_checked_in")).toBeInTheDocument();
  });

  it("calls onIssueStrap with the registration id when the issue-strap button is clicked", async () => {
    const { onIssueStrap } = renderDetail({
      registration: buildRegistration({ strap_issued: false }),
    });

    const issueStrapButton = screen.getByRole("button", { name: /admin_issue_strap/ });
    fireEvent.click(issueStrapButton);

    expect(onIssueStrap).toHaveBeenCalledWith("reg-1");
  });

  it("does not show the issue-strap button once a strap has already been issued", async () => {
    renderDetail({
      registration: buildRegistration({ strap_issued: true }),
    });

    expect(screen.queryByRole("button", { name: /admin_issue_strap/ })).not.toBeInTheDocument();
  });

  it("renders an alert with a merge button per duplicate and calls onMergeDuplicate on click", async () => {
    const { onMergeDuplicate } = renderDetail({
      emailDuplicates: [
        { id: "dup-1", name: "John Doe" },
        { id: "dup-2", name: "Jan Doe" },
      ],
    });

    const alert = screen.getByRole("alert");
    const buttons = within(alert).getAllByRole("button");
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]!);
    expect(onMergeDuplicate).toHaveBeenCalledWith("person-1", "dup-1");

    fireEvent.click(buttons[1]!);
    expect(onMergeDuplicate).toHaveBeenCalledWith("person-1", "dup-2");
  });

  it("renders no duplicates alert when emailDuplicates is empty", async () => {
    renderDetail({ emailDuplicates: [] });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onClose when the footer close button is clicked", async () => {
    const { onClose } = renderDetail();

    fireEvent.click(
      within(screen.getByRole("dialog").querySelector('[data-slot="dialog-footer"]')!).getByRole(
        "button",
        { name: "close" },
      ),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

it("offers all registration email templates and previews the selected registration", async () => {
  renderDetail();
  const template = screen.getByRole("combobox", { name: "admin_email_template_label" });
  expect((await readAdminOptions(template)).map((option) => option.value)).toEqual([
    "general",
    "order",
    "payment",
    "event",
  ]);
  await selectAdminOption(template, "order");
  fireEvent.click(screen.getByRole("button", { name: "admin_email_preview_action" }));
  const dialogs = screen.getAllByRole("dialog");
  const preview = within(dialogs[dialogs.length - 1]!);
  expect(preview.getByDisplayValue(/Brut Reserve × 3/)).toBeInTheDocument();
  expect(preview.getByRole("link", { name: "admin_email_open_client" })).toHaveAttribute(
    "href",
    expect.stringMatching(/^mailto:/),
  );
  expect(preview.queryByText(/Please seat|Wheelchair|token-abc/)).not.toBeInTheDocument();
});

it("prefills and saves order answers alongside the booking", async () => {
  const onSaveBooking = vi.fn().mockResolvedValue(undefined);
  const registration = buildRegistration();
  registration.event!.order_questions = [
    {
      id: "question",
      kind: "free_text",
      active: true,
      title_nl: "Opmerking",
      title_en: null,
      title_fr: null,
      description_nl: null,
      description_en: null,
      description_fr: null,
      options: [],
    },
  ];
  registration.order_answers = [
    {
      question_id: "question",
      option_id: null,
      text: "Old answer",
      rating: null,
      question: registration.event!.order_questions![0]!,
    },
  ];
  renderDetail({ registration, onSaveBooking });
  expect(screen.getByLabelText("Opmerking")).toHaveValue("Old answer");
  fireEvent.change(screen.getByLabelText("Opmerking"), { target: { value: "New answer" } });
  fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
  await waitFor(() =>
    expect(onSaveBooking).toHaveBeenCalledWith(
      "reg-1",
      expect.objectContaining({ orderAnswers: [{ question_id: "question", text: "New answer" }] }),
    ),
  );
});

it("explains invalid booking fields before allowing the existing save", async () => {
  const onSaveBooking = vi.fn().mockResolvedValue(undefined);
  renderDetail({ onSaveBooking });
  const guests = screen.getAllByRole("spinbutton", { name: "admin_guests_count" })[0]!;
  const save = screen.getByRole("button", { name: "admin_booking_save_all" });
  fireEvent.change(guests, { target: { value: "0" } });
  expect(guests).toHaveAttribute("aria-invalid", "true");
  expect(guests).toHaveAccessibleDescription("admin_registration_guests_invalid");
  expect(save).toBeDisabled();
  fireEvent.change(guests, { target: { value: "2" } });
  const quantity = screen.getByRole("spinbutton", { name: "admin_booking_quantity Brut Reserve" });
  fireEvent.change(quantity, { target: { value: "-1" } });
  expect(quantity).toHaveAccessibleDescription("admin_registration_quantity_invalid");
  expect(save).toBeDisabled();
  expect(onSaveBooking).not.toHaveBeenCalled();
  fireEvent.change(quantity, { target: { value: "3" } });
  fireEvent.click(save);
  await waitFor(() =>
    expect(onSaveBooking).toHaveBeenCalledWith(
      "reg-1",
      expect.objectContaining({ guestCount: 2, quantities: { "prod-1": 3 } }),
    ),
  );
});

it("makes booking save ownership distinct from seating and payments", () => {
  renderDetail({ onSaveBooking: vi.fn() });
  const seating = screen.getByRole("group", { name: "admin_action_assign_table" });
  const payments = screen.getByRole("group", { name: "admin_booking_payments" });
  expect(
    within(seating).queryByRole("button", { name: "admin_booking_save_all" }),
  ).not.toBeInTheDocument();
  expect(
    within(payments).queryByRole("button", { name: "admin_booking_save_all" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("admin_booking_save_help")).toBeVisible();
  expect(within(payments).getByText("admin_booking_payment_save_help")).toBeVisible();
});
