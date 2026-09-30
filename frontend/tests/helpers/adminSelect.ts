import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/** Exercise the visible Base UI popup, including portal and dismissal behavior. */
export async function selectAdminOption(trigger: HTMLElement, value: string) {
  fireEvent.click(trigger);
  const listbox = await screen.findByRole("listbox");
  const option = await waitFor(() => {
    const match = within(listbox)
      .getAllByRole("option")
      .find((item) => item.dataset.value === value);
    if (!match) throw new Error(`Missing select option: ${value}`);
    return match;
  });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

export async function readAdminOptions(trigger: HTMLElement) {
  fireEvent.click(trigger);
  const listbox = await screen.findByRole("listbox");
  const options = within(listbox)
    .getAllByRole("option")
    .map((item) => ({
      value: item.dataset.value,
      label: item.textContent,
    }));
  fireEvent.keyDown(listbox, { key: "Escape" });
  return options;
}
