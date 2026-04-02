export const queryKeys = {
  activeEdition: ["active-edition"] as const,
  myRegistrations: (token: string) => ["my-registrations", token] as const,
  checkInRegistration: (registrationId: string, checkInToken: string) =>
    ["check-in", registrationId, checkInToken] as const,
  admin: {
    registrations: ["admin", "registrations"] as const,
    tables: ["admin", "tables"] as const,
    venues: ["admin", "venues"] as const,
    rooms: ["admin", "rooms"] as const,
    tableTypes: ["admin", "table-types"] as const,
    layouts: ["admin", "layouts"] as const,
    exhibitors: ["admin", "exhibitors"] as const,
    areas: ["admin", "areas"] as const,
    people: ["admin", "people"] as const,
    members: ["admin", "members"] as const,
    activeEditionEvents: ["admin", "active-edition", "events"] as const,
    personOptions: (query: string) => ["admin", "person-options", query] as const,
    personOptionsRoot: ["admin", "person-options"] as const,
    editionEvents: (editionId: string) => ["admin", "edition-events", editionId] as const,
    editionModalExhibitors: ["admin", "edition-modal", "exhibitors"] as const,
    itemModalPeople: (query: string) => ["admin", "item-modal", "people", query] as const,
    peopleRegistrations: (personId: string) =>
      ["admin", "people", personId, "registrations"] as const,
    contentManagement: {
      section: (sectionKey: string) => ["admin", "content-management", sectionKey] as const,
      editions: ["admin", "content-management", "editions"] as const,
    },
  },
} as const;
