import { describe, expect, it } from "vitest";
import { m } from "@/paraglide/messages";
import { formatDate, formatDateRange, formatDateTime, formatTime } from "@/lib/format/dateUtils";
import { formatEuro, formatNumber } from "@/lib/format/numberUtils";

describe("interface date, time and number formatting", () => {
  it.each([
    ["en", "6 Mar 2027", "6-8 March 2027", "1,234.50"],
    ["nl", "6 mrt 2027", "6-8 maart 2027", "1.234,50"],
    ["fr", "6 mars 2027", "6-8 mars 2027", "1 234,50"],
  ] as const)("uses the selected %s language", (locale, date, range, number) => {
    expect(formatDate("2027-03-06", locale)).toBe(date);
    expect(formatDateRange(["2027-03-06", "2027-03-08"], locale)).toBe(range);
    expect(formatDateTime(new Date(2027, 2, 6, 17, 0), locale)).toContain("17:00:00");
    expect(formatTime("17:00:00", locale)).toBe("17:00");
    expect(formatNumber(1234.5, locale, { minimumFractionDigits: 2 })).toBe(number);
  });

  it("preserves the year at both ends of a range across New Year", () => {
    expect(formatDateRange(["2026-12-31", "2027-01-01"], "en")).toMatch(
      /31 December 2026.*1 January 2027/,
    );
  });

  it("formats euros in the selected language", () => {
    expect(formatEuro("12.50", "en")).toBe("€12.50");
    expect(formatEuro("12.50", "fr")).toBe("12,50 €");
  });
});

describe("counted interface messages", () => {
  it.each([
    ["en", "1 seat left", "5 seats left", "1 of 2 people assigned", "0/1 order item delivered"],
    [
      "nl",
      "1 plaats vrij",
      "5 plaatsen vrij",
      "1 van 2 personen toegewezen",
      "0/1 bestelartikel geleverd",
    ],
    [
      "fr",
      "1 place restante",
      "5 places restantes",
      "1 sur 2 personnes attribuées",
      "0/1 article livré",
    ],
  ] as const)("inflects counted nouns in %s", (locale, one, many, assignment, delivery) => {
    expect(m.admin_edition_sponsors({ count: 1 }, { locale })).toBe("1 sponsor");
    expect(m.admin_edition_sponsors({ count: 2 }, { locale })).toBe("2 sponsors");
    expect(m.admin_table_capacity_remaining({ count: 1 }, { locale })).toBe(one);
    expect(m.admin_table_capacity_remaining({ count: 5 }, { locale })).toBe(many);
    expect(m.admin_allocation_progress({ assigned: 1, total: 2 }, { locale })).toBe(assignment);
    expect(m.admin_order_delivery_progress({ delivered: 0, total: 1 }, { locale })).toBe(delivery);
  });
});
