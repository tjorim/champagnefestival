import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import {
  PublicCheck,
  PublicDescription,
  PublicError,
  PublicField,
  PublicInput,
  PublicLabel,
  PublicOption,
  PublicSelect,
  PublicTextarea,
} from "@/components/PublicFields";
import { FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { selectAdminOption } from "../helpers/adminSelect";

function Language() {
  const [value, setValue] = useState("nl");
  return (
    <PublicField controlId="language">
      <PublicLabel>Language</PublicLabel>
      <PublicSelect value={value} onValueChange={setValue}>
        <PublicOption value="nl">Nederlands</PublicOption>
        <PublicOption value="fr">Français</PublicOption>
      </PublicSelect>
    </PublicField>
  );
}

describe("owned public fields", () => {
  it("associates labels, descriptions and validation errors", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form noValidate>
        <PublicField controlId="email">
          <PublicLabel>Email</PublicLabel>
          <PublicInput type="email" autoComplete="email" required aria-invalid />
          <PublicDescription>We only use this to confirm</PublicDescription>
          <PublicError>Enter a valid email</PublicError>
        </PublicField>
        <PublicField controlId="notes">
          <PublicLabel>Notes</PublicLabel>
          <PublicTextarea rows={3} />
        </PublicField>
      </form>,
    );
    const email = screen.getByRole("textbox", { name: "Email" });
    expect(email).toBeRequired();
    expect(email).toBeInvalid();
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAccessibleDescription("We only use this to confirm Enter a valid email");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email");
    await user.click(screen.getByText("Notes"));
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveFocus();
    expect(container.querySelector(".form-control, .form-label, .invalid-feedback")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders select popups in the runtime theme, not the fixed-dark admin scope", async () => {
    render(<Language />);
    const trigger = screen.getByRole("combobox", { name: "Language" });
    await selectAdminOption(trigger, "fr");
    expect(trigger).toHaveTextContent("Français");

    await userEvent.click(trigger);
    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest('[data-theme-scope="admin"]')).toBeNull();
    expect(trigger).toHaveAttribute("data-public-form", "true");
  });

  it("supports keyboard selection and focus restoration in the select", async () => {
    const user = userEvent.setup();
    render(<Language />);
    const trigger = screen.getByRole("combobox", { name: "Language" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(trigger).toHaveTextContent("Français");
    expect(trigger).toHaveFocus();
  });

  it("toggles a labeled consent checkbox and keeps the description association", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PublicField controlId="consent">
        <PublicCheck
          id="consent-check"
          label="I agree"
          aria-describedby="consent-description"
          onCheckedChange={onChange}
        />
        <PublicDescription>You can withdraw at any time</PublicDescription>
      </PublicField>,
    );
    const checkbox = screen.getByRole("checkbox", { name: "I agree" });
    expect(checkbox).toHaveAccessibleDescription("You can withdraw at any time");
    await user.click(screen.getByText("I agree"));
    expect(onChange).toHaveBeenCalledWith(true, expect.anything());
    expect(checkbox).toBeChecked();
  });

  it("exposes a named radio group with arrow-key navigation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <FieldTitle id="dish-label">Main dish</FieldTitle>
        <RadioGroup aria-labelledby="dish-label" name="dish" onValueChange={onChange}>
          {["soup", "stew"].map((id) => (
            <div key={id}>
              <RadioGroupItem id={`dish-${id}`} value={id} />
              <FieldLabel htmlFor={`dish-${id}`}>{id === "soup" ? "Soup" : "Stew"}</FieldLabel>
            </div>
          ))}
        </RadioGroup>
      </div>,
    );
    expect(screen.getByRole("radiogroup", { name: "Main dish" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Soup" }));
    expect(onChange).toHaveBeenLastCalledWith("soup", expect.anything());
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("stew", expect.anything());
    expect(screen.getByRole("radio", { name: "Stew" })).toBeChecked();
  });
});
