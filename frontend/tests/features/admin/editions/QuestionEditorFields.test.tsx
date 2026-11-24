import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  OptionLabelInputs,
  QuestionTextInputs,
} from "@/features/admin/editions/QuestionEditorFields";

const blank = { nl: "", fr: "", en: "" };

describe("QuestionEditorFields", () => {
  it("reports question title and description edits per language", async () => {
    const onChange = vi.fn();
    render(
      <QuestionTextInputs
        idPrefix="q"
        title={{ ...blank, nl: "Vraag" }}
        description={blank}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Title (Dutch)")).toHaveValue("Vraag");
    await userEvent.type(screen.getByLabelText("Title (French)"), "Q");
    expect(onChange).toHaveBeenCalledWith("title", "fr", "Q");
    await userEvent.type(screen.getByLabelText("Description (English, optional)"), "D");
    expect(onChange).toHaveBeenCalledWith("description", "en", "D");
  });

  it("reports option label edits per language", async () => {
    const onChange = vi.fn();
    render(
      <OptionLabelInputs idPrefix="o" labels={{ ...blank, en: "Soup" }} onChange={onChange} />,
    );
    expect(screen.getByLabelText("Label (English)")).toHaveValue("Soup");
    await userEvent.type(screen.getByLabelText("Label (Dutch)"), "S");
    expect(onChange).toHaveBeenCalledWith("nl", "S");
  });
});
