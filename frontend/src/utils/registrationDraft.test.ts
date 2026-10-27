import { describe, expect, it } from "vitest";
import type { Product } from "@/types/event";
import {
  draftTotal,
  productDraftState,
  resolveQuantities,
  suggestedQuantities,
} from "@/utils/registrationDraft";

const product = (overrides: Partial<Product>): Product => ({
  id: "p",
  eventId: "e",
  name: "Product",
  description: "",
  nameNl: null,
  nameFr: null,
  nameEn: null,
  descriptionNl: null,
  descriptionFr: null,
  descriptionEn: null,
  price: 10,
  category: "",
  purchasable: true,
  required: false,
  unit: "item",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

const ticket = product({ id: "ticket", price: 15, required: true, unit: "person" });
const bottle = product({ id: "bottle", price: 40 });

describe("registrationDraft", () => {
  it("starts a single required per-person ticket at the party size", () => {
    expect(suggestedQuantities([ticket, bottle], 2)).toEqual({ ticket: 2 });
  });

  it("suggests nothing when the required product is not per person or is ambiguous", () => {
    expect(suggestedQuantities([{ ...ticket, unit: "item" }, bottle], 2)).toEqual({});
    expect(suggestedQuantities([ticket, { ...ticket, id: "child" }], 2)).toEqual({});
    expect(suggestedQuantities([ticket], Number.NaN)).toEqual({});
  });

  it("lets the organiser's entries win over the suggestion, including zero", () => {
    expect(resolveQuantities([ticket, bottle], { ticket: 0, bottle: 1 }, 2)).toEqual({
      ticket: 0,
      bottle: 1,
    });
  });

  it("totals quantities at the product price", () => {
    expect(draftTotal([ticket, bottle], { ticket: 2, bottle: 1 })).toBe(70);
  });

  it("flags an empty order for an event with required products as exempt", () => {
    expect(productDraftState([ticket, bottle], { ticket: 0, bottle: 0 })).toMatchObject({
      exempt: true,
      missingRequired: false,
    });
  });

  it("flags optional products ordered without a required one", () => {
    expect(productDraftState([ticket, bottle], { ticket: 0, bottle: 1 })).toMatchObject({
      exempt: false,
      missingRequired: true,
    });
  });

  it("accepts any order when the event has no required products", () => {
    expect(productDraftState([bottle], { bottle: 0 })).toMatchObject({
      exempt: false,
      missingRequired: false,
    });
  });
});
