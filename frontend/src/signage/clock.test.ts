import { describe, expect, it } from "vitest";
import { estimateOffset, slideAtTime } from "./clock";

describe("signage clock", () => {
  it("uses the least delayed sample even with a wrong device clock", () => {
    expect(
      estimateOffset([
        { sent: 10_000, received: 10_200, server: 600 },
        { sent: 11_000, received: 11_020, server: 1010 },
      ]),
    ).toBe(-10_000);
  });
  it("selects exact slide and cycle boundaries without accumulating drift", () => {
    expect(slideAtTime([2, 3], 1000, 3000)).toEqual({ index: 1, remaining: 3000, boundary: 6000 });
    expect(slideAtTime([2, 3], 1000, 6000).index).toBe(0);
    expect(slideAtTime([2, 3], 1000, 6_000_003).index).toBe(1);
    expect(slideAtTime([2, 3], 1000, 0).index).toBe(1);
    expect(slideAtTime([], 1000, 0).index).toBe(-1);
  });
});
