import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

const people = [
  { value: 1, label: "Alice" },
  { value: 2, label: "Bob" },
];
type Option = (typeof people)[number];

function SingleHarness() {
  const [value, setValue] = useState<Option | null>(null);
  return (
    <Dialog open>
      <DialogContent admin>
        <DialogTitle>Choose person</DialogTitle>
        <label htmlFor="person">Person</label>
        <Combobox
          items={people}
          value={value}
          onValueChange={setValue}
          itemToStringLabel={(item: Option) => item.label}
        >
          <ComboboxInput id="person" aria-label="Person" showClear />
          <ComboboxContent>
            <ComboboxList>
              {(item: Option) => (
                <ComboboxItem key={item.value} value={item}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <output>{value?.label ?? "Unselected"}</output>
      </DialogContent>
    </Dialog>
  );
}

it("searches and selects by keyboard, clears, and keeps the menu in the admin scope", async () => {
  render(<SingleHarness />);
  const input = screen.getByRole("combobox", { name: "Person" });
  await userEvent.type(input, "Bob");
  expect(await screen.findByRole("option", { name: "Bob" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Alice" })).not.toBeInTheDocument();
  expect(screen.getByRole("listbox").closest('[data-theme-scope="admin"]')).toHaveAttribute(
    "data-theme-mode",
    "dark",
  );
  expect(await axe(screen.getByRole("dialog"))).toHaveNoViolations();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByRole("status")).toHaveTextContent("Bob");
  await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.getByRole("status")).toHaveTextContent("Unselected");
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

function MultipleHarness() {
  const [value, setValue] = useState<Option[]>([people[1]!]);
  const anchor = useComboboxAnchor();
  const groups = [
    { label: "Active", items: [people[0]!] },
    { label: "Archived", items: [people[1]!] },
  ];
  return (
    <>
      <label htmlFor="organizations">Organisations</label>
      <Combobox
        multiple
        items={groups}
        value={value}
        onValueChange={setValue}
        itemToStringLabel={(item: Option) => item.label}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(items: Option[]) => (
              <>
                {items.map((item) => (
                  <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
                ))}
                <ComboboxChipsInput id="organizations" />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxList>
            {(group: (typeof groups)[number]) => (
              <ComboboxGroup key={group.label} items={group.items}>
                <ComboboxLabel>{group.label}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: Option) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <output>{value.map((item) => item.label).join(",")}</output>
    </>
  );
}

it("preserves selected archived entries, searches groups and removes individual chips", async () => {
  render(<MultipleHarness />);
  expect(screen.getByRole("status")).toHaveTextContent("Bob");
  await userEvent.type(screen.getByRole("combobox", { name: "Organisations" }), "Alice");
  await screen.findByRole("option", { name: "Alice" });
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Bob,Alice"));
  await userEvent.click(screen.getAllByRole("button", { name: "Remove selection" })[0]!);
  expect(screen.getByRole("status")).toHaveTextContent("Alice");
});
