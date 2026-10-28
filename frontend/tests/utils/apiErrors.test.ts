import { describe, expect, it, vi } from "vitest";
import { ApiError, apiErrorMessage } from "@/utils/apiErrors";

vi.mock("@/paraglide/messages", () => ({
  m: {
    my_eid_conflict: () => "These details conflict with an existing record.",
    my_eid_help: () => "Ask the organisers for help before submitting.",
  },
}));

describe("apiErrorMessage", () => {
  it("explains a volunteer identity conflict instead of repeating the form guidance", () => {
    const error = new ApiError("conflict", { status: 409, code: "volunteer_identity_conflict" });

    expect(apiErrorMessage(error, "fallback")).toBe(
      "These details conflict with an existing record.",
    );
  });

  it("uses the translated fallback for an unknown code", () => {
    const error = new ApiError("boom", { status: 500, code: "something_new" });

    expect(apiErrorMessage(error, "fallback")).toBe("fallback");
  });
});
