/** Deterministic seed data for the read-only admin queue and content screens. */

export const seedWaitlistEntries = [
  {
    id: "waitlist-1",
    product_id: "product-1",
    product_name: "Tasting menu",
    event_id: "event-1",
    event_title: "Champagne dinner",
    name: "Tom Peeters",
    email: "tom@example.com",
    phone: null,
    guest_count: 2,
    notes: "",
    created_at: "2026-10-01T09:00:00Z",
    handled_at: null,
  },
];

export const seedContactMessages = [
  {
    id: "contact-1",
    name: "Eva Janssens",
    email: "eva@example.com",
    message: "Is the festival accessible by wheelchair?",
    created_at: "2026-10-02T10:30:00Z",
    handled_at: null,
  },
];

export const seedFaqItems = [
  {
    id: "faq-1",
    question_nl: "Waar vindt het festival plaats?",
    question_fr: null,
    question_en: "Where does the festival take place?",
    answer_nl: "In de feestzaal van het dorp.",
    answer_fr: null,
    answer_en: "In the village hall.",
    sort_order: 0,
    active: true,
  },
];

export const seedEmailCategories = [
  {
    key: "newsletter",
    name: "Newsletter",
    description: "News about upcoming editions",
    name_nl: "Nieuwsbrief",
    name_fr: null,
    name_en: "Newsletter",
    description_nl: "Nieuws over komende edities",
    description_fr: null,
    description_en: "News about upcoming editions",
    allowed_roles: [],
    automatic: false,
    sort_order: 0,
  },
];

export const seedPrivacyPolicy = {
  key: "privacy",
  title_nl: "Privacybeleid",
  title_en: "Privacy policy",
  title_fr: null,
  versions: [
    {
      id: "policy-version-1",
      policy_key: "privacy",
      version_number: 1,
      status: "published",
      content_nl: "Uw privacy is belangrijk.",
      content_en: "Your privacy matters.",
      content_fr: null,
      change_summary: null,
      created_at: "2026-09-30T00:00:00Z",
      created_by: "admin",
      updated_at: "2026-09-30T00:00:00Z",
      published_at: "2026-09-30T00:00:00Z",
      published_by: "admin",
    },
  ],
};

export const seedAuditEntries = [
  {
    id: "audit-1",
    timestamp: "2026-10-03T12:00:00Z",
    actor: "admin",
    action: "update",
    resource_type: "event",
    resource_id: "event-1",
    request_id: null,
    details: {},
  },
];
