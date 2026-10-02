import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("lets the last conflicting utility win", () => {
    expect(cn("p-4 p-2", false, "p-0")).toBe("p-0");
    expect(cn("hover:p-2", "hover:p-0")).toBe("hover:p-0");
  });

  it("keeps non-conflicting and owned classes", () => {
    expect(cn("site-container mt-2", undefined, "mt-4")).toBe("site-container mt-4");
  });
});
