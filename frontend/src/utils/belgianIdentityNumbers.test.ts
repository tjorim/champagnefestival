import { describe, expect, it } from "vitest";
import {
  formatEidNumber,
  formatNiss,
  isValidEidNumber,
  isValidNiss,
  stripSeparators,
} from "./belgianIdentityNumbers";

describe("stripSeparators", () => {
  it("removes dots, dashes, slashes and spaces", () => {
    expect(stripSeparators("95.12.14-237.64")).toBe("95121423764");
    expect(stripSeparators("595-6570208-28")).toBe("595657020828");
    expect(stripSeparators("95 12 14 237 64")).toBe("95121423764");
  });
});

describe("isValidNiss", () => {
  it("accepts a real checksum-valid pre-2000 NISS, with or without separators", () => {
    expect(isValidNiss("95.12.14-237.64")).toBe(true);
    expect(isValidNiss("95121423764")).toBe(true);
  });

  it("accepts a post-2000 NISS via the +2 000 000 000 retry", () => {
    expect(isValidNiss("05010112385")).toBe(true);
  });

  it("rejects a typo'd digit", () => {
    expect(isValidNiss("95121423765")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidNiss("9512142376")).toBe(false);
  });
});

describe("isValidEidNumber", () => {
  it("accepts a real checksum-valid card number, with or without separators", () => {
    expect(isValidEidNumber("595-6570208-28")).toBe(true);
    expect(isValidEidNumber("595657020828")).toBe(true);
  });

  it("rejects a typo'd digit", () => {
    expect(isValidEidNumber("595657020829")).toBe(false);
  });
});

describe("formatNiss / formatEidNumber", () => {
  it("formats a normalised NISS with the standard separators", () => {
    expect(formatNiss("95121423764")).toBe("95.12.14-237.64");
  });

  it("formats a normalised card number with the standard separators", () => {
    expect(formatEidNumber("595657020828")).toBe("595-6570208-28");
  });

  it("returns the input unchanged if the length doesn't match", () => {
    expect(formatNiss("123")).toBe("123");
    expect(formatEidNumber("123")).toBe("123");
  });
});
