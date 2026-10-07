import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import ItemModal from "@/components/admin/ItemModal";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

function setup() {
  const onSave = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ItemModal
        show
        initial={{
          id: 1,
          name: "Maison",
          image: "/logo.svg",
          description_language: "fr",
          description_fr: "Bonjour",
          description_en: "Hello",
        }}
        authHeaders={() => ({})}
        onSave={onSave}
        onHide={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

describe("exhibitor description editor", () => {
  it("loads and saves descriptions and their original language", async () => {
    const onSave = setup();
    expect(screen.getByLabelText("admin_item_description_fr")).toHaveValue("Bonjour");
    fireEvent.change(screen.getByLabelText("admin_item_description_en"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          description_language: "fr",
          description_fr: "Bonjour",
          description_en: "Updated",
        }),
      ),
    );
  });
  it("rejects missing original text and allows clearing all texts", async () => {
    const onSave = setup();
    fireEvent.change(screen.getByLabelText("admin_item_description_fr"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));
    expect(await screen.findByText("admin_item_description_original_required")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("admin_item_description_en"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "admin_save" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          description_language: null,
          description_fr: null,
          description_en: null,
        }),
      ),
    );
  });
});
