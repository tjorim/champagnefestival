import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import EventProductsModal from "@/components/admin/EventProductsModal";
import { server } from "@/mocks/server";
import type { Event } from "@/types/event";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

const event: Event = {
  id: "event-01",
  editionId: "edition-01",
  title: "VIP Evening",
  description: "",
  date: "2027-03-07",
  startTime: "18:00",
  category: "vip",
  registrationRequired: true,
  active: true,
  createdAt: "",
  updatedAt: "",
  products: [],
};

function renderModal(products: Record<string, unknown>[]) {
  server.use(
    http.get("/api/products", ({ request }) => {
      const eventId = new URL(request.url).searchParams.get("event_id");
      return HttpResponse.json(products.filter((p) => p.event_id === eventId));
    }),
  );
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <EventProductsModal show event={event} authHeaders={authHeaders} onHide={() => {}} />
    </QueryClientProvider>,
  );
}

describe("EventProductsModal", () => {
  it("shows a required badge on required products", async () => {
    renderModal([
      {
        id: "prod-entry",
        event_id: "event-01",
        name: "VIP Entry",
        price: 50,
        category: "other",
        mode: "purchasable",
        required: true,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);

    await screen.findByText("VIP Entry");
    expect(screen.getByText("admin_products_required_badge")).toBeInTheDocument();
  });

  it("shows a mode badge and a sold-out badge for a sold-out purchasable product", async () => {
    renderModal([
      {
        id: "prod-bottle",
        event_id: "event-01",
        name: "Champagne Bottle",
        price: 65,
        category: "champagne",
        mode: "purchasable",
        required: false,
        stock: 0,
        reserved_quantity: 0,
        sold_out: true,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);

    await screen.findByText("Champagne Bottle");
    expect(screen.getByText("admin_products_mode_purchasable")).toBeInTheDocument();
    expect(screen.getByText("admin_products_sold_out")).toBeInTheDocument();
  });

  it("shows a mode badge without a sold-out badge for an internal product", async () => {
    renderModal([
      {
        id: "prod-supply",
        event_id: "event-01",
        name: "Kitchen Supply",
        price: 1,
        category: "other",
        mode: "internal",
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);

    await screen.findByText("Kitchen Supply");
    expect(screen.getByText("admin_products_mode_internal")).toBeInTheDocument();
    expect(screen.queryByText("admin_products_sold_out")).not.toBeInTheDocument();
  });

  it("submits the selected mode when editing a product", async () => {
    let saved: Record<string, unknown> | null = null;
    renderModal([
      {
        id: "prod-bottle",
        event_id: "event-01",
        name: "Champagne Bottle",
        price: 65,
        category: "champagne",
        mode: "purchasable",
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    await screen.findByText("Champagne Bottle");

    server.use(
      http.post("/api/products/prod-bottle/preview", () =>
        HttpResponse.json({
          preview_token: "token-1",
          bookings: [],
          price_changed: false,
          contents_changed: true,
          shortages: [],
        }),
      ),
      http.put("/api/products/prod-bottle", async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...saved, id: "prod-bottle", event_id: "event-01" });
      }),
    );

    fireEvent.click(screen.getByLabelText("Edit Champagne Bottle"));
    fireEvent.change(screen.getByLabelText("admin_products_mode"), {
      target: { value: "internal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));
    await screen.findByText("admin_inventory_review");
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));

    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toMatchObject({ mode: "internal", preview_token: "token-1" });
  });

  it("previews whether a mode change would show or hide this line in a bundling package", async () => {
    renderModal([
      {
        id: "prod-bottle",
        event_id: "event-01",
        name: "Champagne Bottle",
        price: 65,
        category: "champagne",
        mode: "included_visible",
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: "prod-table",
        event_id: "event-01",
        name: "VIP Table",
        price: 200,
        category: "other",
        mode: "purchasable",
        required: true,
        inclusions: [
          {
            product_id: "prod-bottle",
            quantity: 1,
            per_quantity: 1,
            rounding: "down",
            visible: true,
          },
        ],
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    await screen.findByText("Champagne Bottle");

    fireEvent.click(screen.getByLabelText("Edit Champagne Bottle"));
    expect(
      screen.getByText('admin_products_mode_preview_shows({"package":"VIP Table"})'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("admin_products_mode"), {
      target: { value: "internal" },
    });
    expect(
      screen.getByText('admin_products_mode_preview_hides({"package":"VIP Table"})'),
    ).toBeInTheDocument();
  });

  it("shows the bundle note for a product that includes another", async () => {
    renderModal([
      {
        id: "prod-entry",
        event_id: "event-01",
        name: "VIP Table",
        price: 200,
        category: "other",
        mode: "purchasable",
        required: true,
        included_product_id: "prod-bottle",
        included_per_guests: 2,
        created_at: "",
        updated_at: "",
      },
      {
        id: "prod-bottle",
        event_id: "event-01",
        name: "Champagne Bottle",
        price: 65,
        category: "champagne",
        mode: "purchasable",
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);

    await screen.findByText("VIP Table");
    expect(
      screen.getByText('admin_products_bundle_note({"target":"Champagne Bottle","ratio":2})'),
    ).toBeInTheDocument();
  });

  it("submits required and bundle fields when adding a product", async () => {
    renderModal([
      {
        id: "prod-bottle",
        event_id: "event-01",
        name: "Champagne Bottle",
        price: 65,
        category: "champagne",
        mode: "purchasable",
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    await screen.findByText("Champagne Bottle");

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/products", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "prod-new",
            event_id: "event-01",
            name: capturedBody.name,
            price: capturedBody.price,
            category: capturedBody.category,
            mode: "purchasable",
            required: capturedBody.required,
            included_product_id: capturedBody.included_product_id,
            included_per_guests: capturedBody.included_per_guests,
            created_at: "",
            updated_at: "",
          },
          { status: 201 },
        );
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "admin_products_add" }));
    fireEvent.change(screen.getByLabelText("admin_products_name"), {
      target: { value: "VIP Table" },
    });
    fireEvent.change(screen.getByLabelText("admin_products_price"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByLabelText("admin_products_required_label"));
    fireEvent.click(screen.getByRole("button", { name: "admin_inventory_add_inclusion" }));
    fireEvent.change(screen.getByLabelText("admin_products_bundle_target"), {
      target: { value: "prod-bottle" },
    });
    fireEvent.change(screen.getByLabelText("admin_inventory_per_quantity"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody).toMatchObject({
      name: "VIP Table",
      price: 200,
      required: true,
      inclusions: [{ product_id: "prod-bottle", quantity: 1, per_quantity: 2, rounding: "down" }],
    });
  });

  it("does not offer a product being edited as its own bundle target", async () => {
    renderModal([
      {
        id: "prod-bottle",
        event_id: "event-01",
        name: "Champagne Bottle",
        price: 65,
        category: "champagne",
        mode: "purchasable",
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    await screen.findByText("Champagne Bottle");

    fireEvent.click(screen.getByLabelText("Edit Champagne Bottle"));
    fireEvent.click(screen.getByRole("button", { name: "admin_inventory_add_inclusion" }));
    const select = screen.getByLabelText("admin_products_bundle_target") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).not.toContain("Champagne Bottle");
  });

  it("requires reviewing stock shortages before saving an edit", async () => {
    renderModal([
      {
        id: "stocked",
        event_id: event.id,
        name: "Tables",
        price: 50,
        category: "other",
        mode: "purchasable",
        required: false,
        unit: "table",
        stock: 10,
        inclusions: [],
        reserved_quantity: 3,
        created_at: "",
        updated_at: "",
      },
    ]);
    let saved: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/products/stocked/preview", () =>
        HttpResponse.json({
          preview_token: "reviewed-state",
          bookings: [],
          price_changed: false,
          contents_changed: false,
          shortages: [
            { product_id: "stocked", name: "Tables", stock: 1, reserved: 3, shortage: 2 },
          ],
        }),
      ),
      http.put("/api/products/stocked", async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...saved, id: "stocked", event_id: event.id });
      }),
    );
    await screen.findByText("Tables");
    fireEvent.click(screen.getByLabelText("Edit Tables"));
    fireEvent.change(screen.getByLabelText("admin_inventory_stock"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));
    await screen.findByText("admin_inventory_review");
    expect(saved).toBeNull();
    expect(screen.getByRole("button", { name: "admin_save" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("admin_inventory_confirm_shortage"));
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));
    await waitFor(() =>
      expect(saved).toMatchObject({
        stock: 1,
        preview_token: "reviewed-state",
        confirm_shortage: true,
        update_existing_contents: false,
        update_existing_prices: false,
      }),
    );
  });

  it("rejects a blank price instead of silently saving it as free", async () => {
    renderModal([]);
    await screen.findByText("admin_products_empty");

    let postCalled = false;
    server.use(
      http.post("/api/products", () => {
        postCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "admin_products_add" }));
    fireEvent.change(screen.getByLabelText("admin_products_name"), {
      target: { value: "Free Sample" },
    });
    fireEvent.change(screen.getByLabelText("admin_products_price"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));

    await screen.findByText("admin_products_price_invalid");
    expect(postCalled).toBe(false);
  });

  it("shows an error state and disables adding when the products query fails", async () => {
    server.use(
      http.get("/api/products", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <EventProductsModal show event={event} authHeaders={authHeaders} onHide={() => {}} />
      </QueryClientProvider>,
    );

    await screen.findByText("admin_content_error_load");
    expect(screen.queryByText("admin_products_empty")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "admin_products_add" })).toBeDisabled();
  });
});
