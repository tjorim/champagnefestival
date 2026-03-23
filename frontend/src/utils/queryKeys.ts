export const queryKeys = {
  activeEdition: ["active-edition"] as const,
  myRegistrations: (token: string) => ["my-registrations", token] as const,
  checkInRegistration: (registrationId: string, checkInToken: string) =>
    ["check-in", registrationId, checkInToken] as const,
  admin: {
    registrations: (token: string) => ["admin", "registrations", token] as const,
    tables: (token: string) => ["admin", "tables", token] as const,
    venues: (token: string) => ["admin", "venues", token] as const,
    rooms: (token: string) => ["admin", "rooms", token] as const,
    tableTypes: (token: string) => ["admin", "table-types", token] as const,
    layouts: (token: string) => ["admin", "layouts", token] as const,
    exhibitors: (token: string) => ["admin", "exhibitors", token] as const,
    areas: (token: string) => ["admin", "areas", token] as const,
    people: (token: string) => ["admin", "people", token] as const,
    members: (token: string) => ["admin", "members", token] as const,
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
