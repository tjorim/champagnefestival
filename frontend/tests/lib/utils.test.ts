import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("migration class merging", () => {
  it("merges prefixed utilities while preserving Bootstrap classes", () => {
    expect(cn("btn p-4 tw:p-2", false, "tw:p-0")).toBe("btn p-4 tw:p-0");
    expect(cn("tw:hover:p-2", "tw:hover:p-0")).toBe("tw:hover:p-0");
  });
});
