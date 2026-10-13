import { describe, expect, it } from "vitest";
import { hasCurrentHelpPeriod, localIsoDate } from "@/types/person";
import { peopleTableParams } from "@/components/admin/PeopleDataTable";
import type { AdminTableState } from "@/utils/adminTableState";

const period = (lastHelpDay: string | null) => ({
  id: 1,
  firstHelpDay: "2020-01-01",
  lastHelpDay,
  notes: "",
});

describe("hasCurrentHelpPeriod", () => {
  it("counts open periods and periods ending today or later as current", () => {
    expect(hasCurrentHelpPeriod([period(null)])).toBe(true);
    expect(hasCurrentHelpPeriod([period(localIsoDate())])).toBe(true);
    expect(hasCurrentHelpPeriod([period(localIsoDate(1))])).toBe(true);
  });

  it("treats only finished periods, or none, as former", () => {
    expect(hasCurrentHelpPeriod([period(localIsoDate(-1)), period("2021-01-01")])).toBe(false);
    expect(hasCurrentHelpPeriod([])).toBe(false);
  });
});

describe("peopleTableParams volunteering filter", () => {
  const state = (filters: Record<string, string>) =>
    ({ page: 0, pageSize: 20, search: "", sortDir: "asc", filters }) as unknown as AdminTableState;

  it("sends the volunteering filter only for the volunteers tab", () => {
    expect(peopleTableParams(state({ volunteering: "former" }), "volunteer").volunteering).toBe(
      "former",
    );
    expect(peopleTableParams(state({ volunteering: "former" }), "member").volunteering).toBe(
      undefined,
    );
    expect(peopleTableParams(state({ volunteering: "bogus" }), "volunteer").volunteering).toBe(
      undefined,
    );
  });
});
