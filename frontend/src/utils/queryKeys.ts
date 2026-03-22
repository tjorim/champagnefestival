export const queryKeys = {
  activeEdition: ["active-edition"] as const,
  myRegistrations: (token: string) => ["my-registrations", token] as const,
  checkInRegistration: (registrationId: string, checkInToken: string) =>
    ["check-in", registrationId, checkInToken] as const,
  adminDashboard: ["admin-dashboard"] as const,
  admin: {
    activeEditionEvents: ["admin", "active-edition", "events"] as const,
    personOptions: (query: string) => ["admin", "person-options", query] as const,
    personOptionsRoot: ["admin", "person-options"] as const,
    editionModalExhibitors: ["admin", "edition-modal", "exhibitors"] as const,
    itemModalPeople: (query: string) => ["admin", "item-modal", "people", query] as const,
    peopleRegistrations: (personId: string) =>
      ["admin", "people", personId, "registrations"] as const,
    contentManagement: {
      section: (sectionKey: string) => ["content-management", sectionKey] as const,
      editions: ["content-management", "editions"] as const,
    },
  },
} as const;
