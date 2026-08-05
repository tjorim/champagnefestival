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
        active: true,
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

  it("shows the bundle note for a product that includes another", async () => {
    renderModal([
      {
        id: "prod-entry",
        event_id: "event-01",
        name: "VIP Table",
        price: 200,
        category: "other",
        active: true,
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
        active: true,
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
        active: true,
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
            active: true,
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
    fireEvent.change(screen.getByLabelText("admin_products_bundle_target"), {
      target: { value: "prod-bottle" },
    });
    fireEvent.change(screen.getByLabelText("admin_products_bundle_ratio"), {
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
      included_product_id: "prod-bottle",
      included_per_guests: 2,
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
        active: true,
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    await screen.findByText("Champagne Bottle");

    fireEvent.click(screen.getByLabelText("Edit Champagne Bottle"));
    const select = screen.getByLabelText("admin_products_bundle_target") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).not.toContain("Champagne Bottle");
  });
});
