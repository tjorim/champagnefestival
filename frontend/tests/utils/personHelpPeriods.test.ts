import { describe, expect, it } from "vitest";
import { lastHelpedDay } from "@/types/person";

const period = (lastHelpDay: string | null) => ({
  id: 1,
  firstHelpDay: "2020-01-01",
  lastHelpDay,
  notes: "",
});

describe("lastHelpedDay", () => {
  it("is ongoing while any period is open", () => {
    expect(lastHelpedDay([period("2021-03-22"), period(null)])).toBe("ongoing");
  });

  it("is the latest end day otherwise", () => {
    expect(lastHelpedDay([period("2021-03-22"), period("2024-03-24"), period("2022-03-20")])).toBe(
      "2024-03-24",
    );
  });

  it("is null without periods", () => {
    expect(lastHelpedDay([])).toBeNull();
  });
});
