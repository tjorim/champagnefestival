import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RegistrationDetail from "@/components/admin/RegistrationDetail";
import type { FloorTable } from "@/types/admin";
import type { Registration } from "@/types/registration";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const tables: FloorTable[] = [
  {
    id: "table-1",
    name: "Table 10",
    capacity: 8,
    x: 10,
    y: 10,
    tableTypeId: "type-1",
    rotation: 0,
    layoutId: "layout-1",
    registrationIds: [],
  },
  {
    id: "table-2",
    name: "Table 2",
    capacity: 6,
    x: 20,
    y: 20,
    tableTypeId: "type-1",
    rotation: 0,
    layoutId: "layout-1",
    registrationIds: ["reg-1"],
  },
];

function buildRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "reg-1",
    personId: "person-1",
    person: {
      id: "person-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+32 470 00 00 00",
    },
    eventId: "event-1",
    event: {
      id: "event-1",
      editionId: "edition-1",
      title: "Grand Tasting",
      description: "",
      date: "2026-05-01",
      startTime: "18:00",
      category: "tasting",
      products: [],
      registrationRequired: true,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      edition: {
        id: "edition-1",
        year: 2026,
        month: "may",
        editionType: "festival",
        active: true,
      },
    },
    guestCount: 2,
    orderItems: [
      {
        productId: "prod-1",
        name: "Brut Reserve",
        quantity: 3,
        deliveredQuantity: 1,
        remainingQuantity: 2,
        price: 25,
        category: "champagne",
        delivered: false,
        includedQuantity: 0,
        visible: true,
      },
    ],
    notes: "Please seat near the window. Wheelchair access needed.",

    status: "confirmed",
    paymentStatus: "paid",
    checkedIn: false,
    strapIssued: false,
    checkInToken: "token-abc",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
  it("renders nothing when registration is null", () => {
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

  it("renders guest info from the registration", () => {
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

  it("hides notes when absent", () => {
    renderDetail({
      registration: buildRegistration({ notes: "" }),
    });

    expect(screen.queryByText("Please seat near the window.")).not.toBeInTheDocument();
    expect(screen.queryByText("Wheelchair access needed.")).not.toBeInTheDocument();
  });

  it("renders order-item rows with delivered/remaining badges for festival registrations", () => {
    renderDetail();

    expect(screen.getByText("Brut Reserve")).toBeInTheDocument();
    expect(screen.getByText("admin_bottle_delivered: 1/3")).toBeInTheDocument();
    expect(screen.getByText("admin_bottle_not_delivered: 2")).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "admin_bottle_delivered Brut Reserve" }),
    ).toHaveValue(1);
  });

  it("updates delivered order-item quantities from the numeric input", () => {
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
          deliveredQuantity: 3,
          remainingQuantity: 0,
          delivered: true,
        }),
      ]),
    );
  });

  it("keeps a whole-table booking partially allocated without inventing a companion count", () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        bookedTableQuantity: 3,
        allocations: [{ tableId: "table-1", guestCount: 0, exclusive: true }],
      }),
    });
    expect(screen.getByText(/admin_allocation_progress/)).toHaveTextContent(
      '"assigned":1,"total":3',
    );
    fireEvent.click(screen.getByRole("button", { name: "admin_allocation_add" }));
    const selectors = screen.getAllByRole("combobox", { name: "admin_inventory_unit_table" });
    expect(
      within(selectors[1]!).queryByRole("option", { name: /Table 10/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(selectors[1]!, { target: { value: "table-2" } });
    fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
    expect(onSaveBooking).toHaveBeenCalledWith(
      "reg-1",
      expect.objectContaining({
        allocations: [
          { tableId: "table-1", guestCount: 0, exclusive: true },
          { tableId: "table-2", guestCount: 0, exclusive: true },
        ],
      }),
    );
  });

  it("records actual guest counts when splitting a booking", () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        guestCount: 6,
        allocations: [
          { tableId: "table-1", guestCount: 4, exclusive: false },
          { tableId: "table-2", guestCount: 2, exclusive: false },
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
    expect(onSaveBooking).toHaveBeenCalledWith(
      "reg-1",
      expect.objectContaining({
        allocations: [
          { tableId: "table-1", guestCount: 4, exclusive: false },
          { tableId: "table-2", guestCount: 1, exclusive: false },
        ],
      }),
    );
  });

  it("saves table allocations explicitly from the detail modal", async () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        allocations: [{ tableId: "table-2", guestCount: 2, exclusive: false }],
      }),
    });

    const select = screen.getByRole("combobox", { name: "admin_inventory_unit_table" });
    expect(select).toHaveValue("table-2");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "admin_unassigned",
      'Table 2 (admin_table_capacity_remaining({"count":6}))',
      'Table 10 (admin_table_capacity_remaining({"count":8}))',
    ]);

    fireEvent.change(select, { target: { value: "table-1" } });

    expect(onSaveBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
    expect(onSaveBooking).toHaveBeenCalledWith(
      "reg-1",
      expect.objectContaining({
        allocations: [{ tableId: "table-1", guestCount: 2, exclusive: false }],
      }),
    );
  });

  it("shows remaining seats, not total capacity, when another booking already occupies a table", () => {
    const otherRegistration = buildRegistration({
      id: "reg-2",
      allocations: [{ tableId: "table-1", guestCount: 3, exclusive: false }],
    });
    renderDetail({
      onSaveBooking: vi.fn().mockResolvedValue(undefined),
      registration: buildRegistration({
        allocations: [{ tableId: "table-2", guestCount: 2, exclusive: false }],
      }),
      registrations: [
        buildRegistration({
          allocations: [{ tableId: "table-2", guestCount: 2, exclusive: false }],
        }),
        otherRegistration,
      ],
    });

    const select = screen.getByRole("combobox", { name: "admin_inventory_unit_table" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "admin_unassigned",
      'Table 2 (admin_table_capacity_remaining({"count":6}))',
      // Table 10 has capacity 8; reg-2 (a different registration) occupies 3 of them.
      'Table 10 (admin_table_capacity_remaining({"count":5}))',
    ]);
  });

  it("previews a table quantity reduction and saves the chosen release with payment", () => {
    const onSaveBooking = vi.fn().mockResolvedValue(undefined);
    const tableProduct = {
      id: "table-product",
      eventId: "event-1",
      name: "Bourse table",
      description: "",
      price: 50,
      category: "other" as const,
      unit: "table" as const,
      active: true,
      required: false,
      createdAt: "",
      updatedAt: "",
    };
    renderDetail({
      onSaveBooking,
      registration: buildRegistration({
        amountPaid: 100,
        orderItems: [
          {
            productId: tableProduct.id,
            name: tableProduct.name,
            quantity: 2,
            includedQuantity: 0,
            deliveredQuantity: 0,
            remainingQuantity: 2,
            delivered: false,
            price: 50,
            category: "other",
            visible: true,
          },
        ],
        bookedTableQuantity: 2,
        allocations: [
          { tableId: "table-1", guestCount: 0, exclusive: true },
          { tableId: "table-2", guestCount: 0, exclusive: true },
        ],
        event: { ...buildRegistration().event!, products: [tableProduct] },
      }),
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "admin_booking_quantity Bourse table" }),
      {
        target: { value: "1" },
      },
    );
    expect(screen.getByText(/admin_booking_release_tables/)).toBeInTheDocument();
    expect(screen.getByText(/admin_inventory_refund/)).toHaveTextContent("€50.00");
    expect(screen.getByRole("button", { name: "admin_booking_save_all" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "admin_inventory_remove" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "admin_booking_save_all" }));
    expect(onSaveBooking).toHaveBeenCalledWith(
      "reg-1",
      expect.objectContaining({
        quantities: { "table-product": 1 },
        amountPaid: 100,
        allocations: [{ tableId: "table-1", guestCount: 0, exclusive: true }],
      }),
    );
  });

  it("hides table assignment for simple RSVP (non-festival) registrations", () => {
    renderDetail({
      registration: buildRegistration({
        event: {
          id: "event-2",
          editionId: "edition-2",
          title: "Bourse Meetup",
          description: "",
          date: "2026-05-01",
          startTime: "18:00",
          category: "bourse",
          products: [],
          registrationRequired: true,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          edition: {
            id: "edition-2",
            year: 2026,
            month: "may",
            editionType: "bourse",
            active: true,
          },
        },
      }),
    });

    expect(
      screen.queryByRole("combobox", { name: "admin_action_assign_table" }),
    ).not.toBeInTheDocument();
  });

  it("hides order items and strap section for simple RSVP (non-festival) registrations", () => {
    renderDetail({
      registration: buildRegistration({
        event: {
          id: "event-2",
          editionId: "edition-2",
          title: "Bourse Meetup",
          description: "",
          date: "2026-05-01",
          startTime: "18:00",
          category: "bourse",
          products: [],
          registrationRequired: true,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          edition: {
            id: "edition-2",
            year: 2026,
            month: "may",
            editionType: "bourse",
            active: true,
          },
        },
      }),
    });

    expect(screen.queryByText("Brut Reserve")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /admin_issue_strap/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/admin_strap_issued|admin_strap_not_issued/)).not.toBeInTheDocument();
  });

  it("shows the check-in button when not checked in and calls onCheckIn on click", () => {
    const { onCheckIn } = renderDetail({
      registration: buildRegistration({ checkedIn: false }),
    });

    const checkInButton = screen.getByRole("button", { name: /admin_mark_checked_in/ });
    fireEvent.click(checkInButton);

    expect(onCheckIn).toHaveBeenCalledWith("reg-1");
  });

  it("hides the check-in button and shows the checked-in badge when already checked in", () => {
    renderDetail({
      registration: buildRegistration({ checkedIn: true }),
    });

    expect(screen.queryByRole("button", { name: /admin_mark_checked_in/ })).not.toBeInTheDocument();
    expect(screen.getByText("admin_checked_in")).toBeInTheDocument();
  });

  it("calls onIssueStrap with the registration id when the issue-strap button is clicked", () => {
    const { onIssueStrap } = renderDetail({
      registration: buildRegistration({ strapIssued: false }),
    });

    const issueStrapButton = screen.getByRole("button", { name: /admin_issue_strap/ });
    fireEvent.click(issueStrapButton);

    expect(onIssueStrap).toHaveBeenCalledWith("reg-1");
  });

  it("does not show the issue-strap button once a strap has already been issued", () => {
    renderDetail({
      registration: buildRegistration({ strapIssued: true }),
    });

    expect(screen.queryByRole("button", { name: /admin_issue_strap/ })).not.toBeInTheDocument();
  });

  it("renders an alert with a merge button per duplicate and calls onMergeDuplicate on click", () => {
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

  it("renders no duplicates alert when emailDuplicates is empty", () => {
    renderDetail({ emailDuplicates: [] });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onClose when the footer close button is clicked", () => {
    const { onClose } = renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

it("offers all registration email templates and previews the selected registration", () => {
  renderDetail();
  const template = screen.getByRole("combobox", { name: "admin_email_template_label" });
  expect(
    within(template)
      .getAllByRole("option")
      .map((option) => option.getAttribute("value")),
  ).toEqual(["general", "order", "payment", "event"]);
  fireEvent.change(template, { target: { value: "order" } });
  fireEvent.click(screen.getByRole("button", { name: "admin_email_preview_action" }));
  const dialogs = screen.getAllByRole("dialog");
  const preview = within(dialogs[dialogs.length - 1]!);
  expect(preview.getByDisplayValue(/Brut Reserve × 3/)).toBeInTheDocument();
  expect(preview.getByRole("button", { name: "admin_email_open_client" })).toHaveAttribute(
    "href",
    expect.stringMatching(/^mailto:/),
  );
  expect(preview.queryByText(/Please seat|Wheelchair|token-abc/)).not.toBeInTheDocument();
});
