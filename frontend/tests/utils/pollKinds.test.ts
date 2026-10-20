import { describe, expect, it, vi } from "vitest";
import {
  parsePollKind,
  pollCountsSummary,
  POLL_KIND_HAS_NOTE,
  POLL_KIND_HAS_DIETARY_TAGS,
  POLL_KIND_HAS_OPTIONS,
  POLL_QUESTION_KINDS,
} from "@/utils/pollKinds";

vi.mock("@/paraglide/messages", () => ({
  m: {
    admin_poll_yes_no_summary: (args: unknown) => `summary(${JSON.stringify(args)})`,
    admin_poll_question_kind_yes_no: () => "Yes/no",
    admin_poll_question_kind_meals: () => "Meals",
  },
}));

describe("poll question kinds", () => {
  it("reads a known kind and falls back to meals for an unknown one", () => {
    expect(parsePollKind("yes_no")).toBe("yes_no");
    expect(parsePollKind("meals")).toBe("meals");
    expect(parsePollKind("rating")).toBe("rating");
    expect(parsePollKind("single_choice")).toBe("single_choice");
    expect(parsePollKind("free_text")).toBe("free_text");
    expect(parsePollKind("unknown")).toBe("meals");
    expect(parsePollKind(undefined)).toBe("meals");
  });

  it("summarises a yes/no question only", () => {
    const counts = { yesCount: 2, noCount: 1, peopleTotal: 5 };
    expect(pollCountsSummary("yes_no", counts)).toBe('summary({"yes":2,"people":5,"no":1})');
    expect(pollCountsSummary("meals", counts)).toBeNull();
  });

  it("declares every kind's capabilities", () => {
    expect(Object.keys(POLL_KIND_HAS_OPTIONS).sort()).toEqual([...POLL_QUESTION_KINDS].sort());
    expect(Object.keys(POLL_KIND_HAS_DIETARY_TAGS).sort()).toEqual([...POLL_QUESTION_KINDS].sort());
    expect(Object.keys(POLL_KIND_HAS_NOTE).sort()).toEqual([...POLL_QUESTION_KINDS].sort());
  });
});
