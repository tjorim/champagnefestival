import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadColVis, saveColVis } from "./columnVisibility";

describe("columnVisibility utils", () => {
  const KEY = "test-col-vis";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("loadColVis", () => {
    it("returns empty object when nothing is stored for the key", () => {
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when a different key is stored", () => {
      localStorage.setItem("other-key", JSON.stringify({ col1: true }));
      expect(loadColVis(KEY)).toEqual({});
    });

    it("round-trips a valid visibility state", () => {
      const state = { name: true, email: false, phone: true };
      localStorage.setItem(KEY, JSON.stringify(state));
      expect(loadColVis(KEY)).toEqual(state);
    });

    it("returns empty object for a single false column", () => {
      const state = { name: false };
      localStorage.setItem(KEY, JSON.stringify(state));
      expect(loadColVis(KEY)).toEqual(state);
    });

    it("returns empty object when stored value is a plain string", () => {
      localStorage.setItem(KEY, "not-json");
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when stored value is a JSON array", () => {
      localStorage.setItem(KEY, JSON.stringify([true, false]));
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when stored value is null (JSON null)", () => {
      localStorage.setItem(KEY, "null");
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when stored value is a JSON number", () => {
      localStorage.setItem(KEY, "42");
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when stored value is a JSON string", () => {
      localStorage.setItem(KEY, '"hello"');
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when an object contains a non-boolean value", () => {
      localStorage.setItem(KEY, JSON.stringify({ name: true, email: "yes" }));
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when an object contains a numeric value", () => {
      localStorage.setItem(KEY, JSON.stringify({ name: 1 }));
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object when an object contains a null value", () => {
      localStorage.setItem(KEY, JSON.stringify({ name: null }));
      expect(loadColVis(KEY)).toEqual({});
    });

    it("returns empty object for an empty object", () => {
      localStorage.setItem(KEY, JSON.stringify({}));
      expect(loadColVis(KEY)).toEqual({});
    });

    it("handles multiple columns all hidden", () => {
      const state = { col1: false, col2: false, col3: false };
      localStorage.setItem(KEY, JSON.stringify(state));
      expect(loadColVis(KEY)).toEqual(state);
    });

    it("handles multiple columns all visible", () => {
      const state = { col1: true, col2: true, col3: true };
      localStorage.setItem(KEY, JSON.stringify(state));
      expect(loadColVis(KEY)).toEqual(state);
    });

    it("uses separate namespaces for different keys", () => {
      const stateA = { name: true };
      const stateB = { email: false };
      localStorage.setItem("key-a", JSON.stringify(stateA));
      localStorage.setItem("key-b", JSON.stringify(stateB));

      expect(loadColVis("key-a")).toEqual(stateA);
      expect(loadColVis("key-b")).toEqual(stateB);
    });

    it("returns empty object when localStorage throws (e.g. SecurityError)", () => {
      const getItemSpy = vi
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("SecurityError");
        });

      expect(loadColVis(KEY)).toEqual({});

      getItemSpy.mockRestore();
    });
  });

  describe("saveColVis", () => {
    it("persists a visibility state that loadColVis can restore", () => {
      const state = { name: true, email: false };
      saveColVis(KEY, state);
      expect(loadColVis(KEY)).toEqual(state);
    });

    it("overwrites a previously saved state", () => {
      saveColVis(KEY, { name: true });
      saveColVis(KEY, { name: false, phone: true });
      expect(loadColVis(KEY)).toEqual({ name: false, phone: true });
    });

    it("persists an empty object without throwing", () => {
      saveColVis(KEY, {});
      expect(loadColVis(KEY)).toEqual({});
    });

    it("does not throw when localStorage.setItem throws (e.g. quota exceeded)", () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceededError");
        });

      expect(() => saveColVis(KEY, { name: true })).not.toThrow();

      setItemSpy.mockRestore();
    });

    it("serialises booleans correctly", () => {
      saveColVis(KEY, { a: true, b: false });
      const raw = localStorage.getItem(KEY);
      expect(raw).toBe('{"a":true,"b":false}');
    });
  });

  describe("round-trip integration", () => {
    it("save then load returns identical state", () => {
      const state = { firstName: true, lastName: false, age: true, email: false };
      saveColVis(KEY, state);
      expect(loadColVis(KEY)).toEqual(state);
    });

    it("save with one key does not pollute another key", () => {
      saveColVis("key-one", { col1: true });
      saveColVis("key-two", { col2: false });

      expect(loadColVis("key-one")).toEqual({ col1: true });
      expect(loadColVis("key-two")).toEqual({ col2: false });
    });
  });
});
