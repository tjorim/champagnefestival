import { expect, it } from "vitest";
import { hasMultipleRooms, standsByOrganization, summarizeStands, type Stand } from "./standsApi";

const friday: Stand = {
  event_id: "e1",
  date: "2099-03-20",
  room_name: "Hall 5",
  label: "Stand 12",
};
const saturday: Stand = {
  event_id: "e2",
  date: "2099-03-21",
  room_name: "Hall 5",
  label: "Stand 12",
};

it("collapses an unchanged stand to one line without a day", () => {
  expect(summarizeStands([friday, saturday], "en", false)).toEqual([
    { day: null, stand: "Stand 12" },
  ]);
});

it("names the room only when asked", () => {
  expect(summarizeStands([friday], "en", true)).toEqual([
    { day: null, stand: "Stand 12 · Hall 5" },
  ]);
});

it("lists one line per day when the stand moves", () => {
  const moved: Stand = { ...saturday, label: "Stand 3" };
  expect(summarizeStands([friday, moved], "en", false)).toEqual([
    { day: "Fri, Mar 20", stand: "Stand 12" },
    { day: "Sat, Mar 21", stand: "Stand 3" },
  ]);
});

it("returns nothing for an organization without stands", () => {
  expect(summarizeStands([], "en", false)).toEqual([]);
});

it("indexes stands by organization and detects several rooms", () => {
  const organizations = [
    { organization_id: 1, name: "A", stands: [friday] },
    { organization_id: 2, name: "B", stands: [{ ...friday, room_name: "Cellar" }] },
  ];
  expect(standsByOrganization(organizations).get(1)).toEqual([friday]);
  expect(standsByOrganization(undefined).size).toBe(0);
  expect(hasMultipleRooms(organizations)).toBe(true);
  expect(hasMultipleRooms(organizations.slice(0, 1))).toBe(false);
});
