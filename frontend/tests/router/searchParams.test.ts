import { describe, expect, it } from "vitest";
import { validateCheckInSearch, validateMyRegistrationsSearch } from "@/router";

describe("router search param validation", () => {
  it("keeps check-in deep-link params when they are strings", () => {
    expect(validateCheckInSearch({ id: "reg-01", token: "abc123" })).toEqual({
      id: "reg-01",
      token: "abc123",
    });
  });

  it("drops non-string check-in params", () => {
    expect(validateCheckInSearch({ id: 12, token: true })).toEqual({
      id: undefined,
      token: undefined,
    });
  });

  it("keeps my-registrations token only when string", () => {
    expect(validateMyRegistrationsSearch({ token: "secure-token" })).toEqual({
      token: "secure-token",
    });
    expect(validateMyRegistrationsSearch({ token: 42 })).toEqual({
      token: undefined,
    });
  });
});
