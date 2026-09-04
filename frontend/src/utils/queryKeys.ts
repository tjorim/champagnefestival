export const queryKeys = {
  activeEdition: ["active-edition"] as const,
  faq: (locale: string) => ["faq", locale] as const,
  announcements: (locale: string) => ["announcements", locale] as const,
  policy: (policyKey: string, locale: string) => ["policy", policyKey, locale] as const,
  maintenanceMode: ["maintenance-mode"] as const,
  myRegistrations: (token: string) => ["my-registrations", token] as const,
  checkInRegistration: (registrationId: string, checkInToken: string) =>
    ["check-in", registrationId, checkInToken] as const,
  volunteerRegistrationSearch: (query: string) => ["volunteer", "registrations", query] as const,
  admin: {
    /** The admin dashboard's active edition — any type, unlike the public one. */
    activeEdition: ["admin", "active-edition"] as const,
    registrations: ["admin", "registrations"] as const,
    /**
     * Nested under `registrations` on purpose: these counts are derived from
     * registrations, so every invalidation of that key — mutations, live-stream
     * events, reconnect recovery — refreshes them without a separate wiring.
     */
    eventCheckInStats: ["admin", "registrations", "checkin-stats"] as const,
    /** One server-paginated page of the admin registration table; see RegistrationList. */
    registrationsPage: (filters: {
      q: string;
      status: string;
      personId: string;
      editionId: string;
      eventDate: string;
      editionCategory: string;
      sort: string;
      sortDir: string;
      page: number;
      pageSize: number;
    }) =>
      [
        "admin",
        "registrations",
        "page",
        filters.q,
        filters.status,
        filters.personId,
        filters.editionId,
        filters.eventDate,
        filters.editionCategory,
        filters.sort,
        filters.sortDir,
        filters.page,
        filters.pageSize,
      ] as const,
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
    eventProducts: (eventId: string) => ["admin", "event-products", eventId] as const,
    editionModalExhibitors: ["admin", "edition-modal", "exhibitors"] as const,
    itemModalPeople: (query: string) => ["admin", "item-modal", "people", query] as const,
    peopleRegistrations: (personId: string) =>
      ["admin", "people", personId, "registrations"] as const,
    auditResourceTypes: ["admin", "audit", "resource-types"] as const,
    auditEntries: (filters: {
      resourceType: string;
      resourceId: string;
      actor: string;
      action: string;
      since: string;
      until: string;
      page: number;
    }) =>
      [
        "admin",
        "audit",
        "entries",
        filters.resourceType,
        filters.resourceId,
        filters.actor,
        filters.action,
        filters.since,
        filters.until,
        filters.page,
      ] as const,
    editionStats: ["admin", "edition-stats"] as const,
    faqItems: ["admin", "faq-items"] as const,
    announcements: ["admin", "announcements"] as const,
    policy: (policyKey: string) => ["admin", "policies", policyKey] as const,
    settings: ["admin", "settings"] as const,
    contactMessages: ["admin", "contact-messages"] as const,
    contentManagement: {
      section: (sectionKey: string) => ["admin", "content-management", sectionKey] as const,
      editions: ["admin", "content-management", "editions"] as const,
    },
  },
} as const;
