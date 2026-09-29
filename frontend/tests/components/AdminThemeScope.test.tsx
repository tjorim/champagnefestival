import { Dialog } from "@base-ui/react/dialog";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { expect, it } from "vitest";
import { AdminThemeScope } from "@/components/admin/AdminThemeScope";

it("carries fixed-dark scope inside a Base UI portal outside the admin page", async () => {
  const { container } = render(
    <section id="admin">
      <Dialog.Root open>
        <Dialog.Portal>
          <AdminThemeScope>
            <Dialog.Popup>
              <Dialog.Title>Booking details</Dialog.Title>
              <Dialog.Description>Review this booking.</Dialog.Description>
              <Dialog.Close>Close</Dialog.Close>
            </Dialog.Popup>
          </AdminThemeScope>
        </Dialog.Portal>
      </Dialog.Root>
    </section>,
  );
  const dialog = await screen.findByRole("dialog");
  expect(container.contains(dialog)).toBe(false);
  const scope = dialog.closest('[data-theme-scope="admin"]');
  expect(scope).toHaveAttribute("data-theme-mode", "dark");
  expect(scope).toHaveAttribute("data-bs-theme", "dark");
  const result = await axe(dialog);
  expect(result.violations).toEqual([]);
});
