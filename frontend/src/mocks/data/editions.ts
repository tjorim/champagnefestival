/** Seed data for editions and events. */

const BASE_VENUE = {
  id: "venue-01",
  name: "Brussels Expo",
  address: "Place de Belgique 1",
  city: "Brussels",
  postal_code: "1020",
  country: "Belgium",
  lat: 50.9067,
  lng: 4.3525,
  active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

type Language = "nl" | "fr" | "en";

/** Original-language text for an event, as the API returns it (`title`/`description` resolved to the original). */
function originalText(
  language: Language,
  title: string,
  description: string,
  translations: Partial<Record<Language, string>> = {},
) {
  const titles: Record<Language, string | null> = { nl: null, fr: null, en: null };
  Object.assign(titles, translations);
  titles[language] = title;
  const descriptions: Record<Language, string | null> = { nl: null, fr: null, en: null };
  if (description) descriptions[language] = description;
  return {
    title,
    description,
    title_language: language,
    title_nl: titles.nl,
    title_fr: titles.fr,
    title_en: titles.en,
    description_language: description ? language : null,
    description_nl: descriptions.nl,
    description_fr: descriptions.fr,
    description_en: descriptions.en,
  };
}

/** Original-language name of a product, as the API returns it. */
function productName(
  language: Language,
  name: string,
  translations: Partial<Record<Language, string>> = {},
) {
  const names: Record<Language, string | null> = { nl: null, fr: null, en: null };
  Object.assign(names, translations);
  names[language] = name;
  return {
    name,
    name_language: language,
    name_nl: names.nl,
    name_fr: names.fr,
    name_en: names.en,
    description: "",
    description_language: null,
    description_nl: null,
    description_fr: null,
    description_en: null,
  };
}

export const seedEvents = [
  {
    id: "event-01",
    edition_id: "march-2027",
    ...originalText(
      "en",
      "Grand Opening",
      "Join us for the grand opening of the Champagnefestival 2027!",
      {
        nl: "Grote opening",
        fr: "Grande ouverture",
      },
    ),
    date: "2027-03-06",
    start_time: "18:00",
    end_time: "22:00",
    category: "ceremony",
    registration_required: true,
    registrations_open_from: "2027-01-01T00:00:00Z",
    sort_order: 1,
    active: true,
    edition: {
      id: "march-2027",
      year: 2027,
      month: "march",
      edition_type: "festival",
      active: true,
    },
    products: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "event-02",
    edition_id: "march-2027",
    ...originalText(
      "en",
      "Tasting Day 1",
      "Explore over 80 champagne houses in Hall 5 and Hall 6.",
    ),
    date: "2027-03-07",
    start_time: "10:00",
    end_time: "20:00",
    category: "tasting",
    registration_required: true,
    registrations_open_from: "2027-01-01T00:00:00Z",
    sort_order: 2,
    active: true,
    edition: {
      id: "march-2027",
      year: 2027,
      month: "march",
      edition_type: "festival",
      active: true,
    },
    products: [
      {
        id: "product-01",
        event_id: "event-02",
        ...productName("en", "Champagne Bottle (Standard)", { nl: "Champagnefles (standaard)" }),
        price: 65,
        category: "champagne",
        purchasable: true,
        required: false,
        inclusions: [{ product_id: "product-03", quantity: 1, per_quantity: 1, rounding: "down" }],
        included_product_id: null,
        included_per_guests: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "product-02",
        event_id: "event-02",
        ...productName("en", "Cheese Platter", { nl: "Kaasplank", fr: "Plateau de fromages" }),
        price: 25,
        category: "food",
        purchasable: true,
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "product-03",
        event_id: "event-02",
        ...productName("en", "Napkin"),
        price: 0.5,
        category: "other",
        purchasable: false,
        required: false,
        included_product_id: null,
        included_per_guests: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "event-03",
    edition_id: "march-2027",
    ...originalText("en", "Tasting Day 2", "Second day of tastings. New masterclasses available."),
    date: "2027-03-08",
    start_time: "10:00",
    end_time: "20:00",
    category: "tasting",
    registration_required: true,
    registrations_open_from: "2027-01-01T00:00:00Z",
    sort_order: 3,
    active: true,
    edition: {
      id: "march-2027",
      year: 2027,
      month: "march",
      edition_type: "festival",
      active: true,
    },
    products: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "event-04",
    edition_id: "march-2027",
    ...originalText(
      "en",
      "Masterclass: Blanc de Blancs",
      "An in-depth masterclass exploring Blanc de Blancs champagnes.",
    ),
    date: "2027-03-07",
    start_time: "14:00",
    end_time: "15:30",
    category: "general",
    registration_required: true,
    registrations_open_from: "2027-01-15T00:00:00Z",
    sort_order: 4,
    active: true,
    edition: {
      id: "march-2027",
      year: 2027,
      month: "march",
      edition_type: "festival",
      active: true,
    },
    products: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "event-05",
    edition_id: "march-2027",
    ...originalText(
      "en",
      "Community Drinks",
      "Informal gathering for festival volunteers and organisers.",
    ),
    date: "2027-03-06",
    start_time: "17:00",
    end_time: "18:00",
    category: "social",
    registration_required: false,
    registrations_open_from: null,
    sort_order: 0,
    active: true,
    edition: {
      id: "march-2027",
      year: 2027,
      month: "march",
      edition_type: "festival",
      active: true,
    },
    products: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

export const seedEditions = [
  {
    id: "march-2027",
    year: 2027,
    month: "march",
    edition_type: "festival",
    dates: ["2027-03-06", "2027-03-07", "2027-03-08"],
    venue: BASE_VENUE,
    events: seedEvents,
    producers: [
      {
        id: 1,
        name: "Maison Moët & Chandon",
        image: "/images/moet.png",
        website: "https://www.moet.com",
        description_language: "fr",
        description_fr: "Maison de champagne présentant ses cuvées au festival.",
        description_en: "Champagne house presenting its cuvées at the festival.",
        type: "producer",
      },
      {
        id: 2,
        name: "Champagne Bollinger",
        image: "/images/bollinger.png",
        website: "https://www.champagne-bollinger.com",
        type: "producer",
      },
      {
        id: 3,
        name: "Nicolas Feuillatte",
        image: "/images/feuillatte.png",
        website: "https://www.feuillatte.com",
        type: "producer",
      },
    ],
    sponsors: [
      {
        id: 4,
        name: "Belga Spirits",
        image: "/images/belga.png",
        website: "https://www.belga-spirits.be",
        type: "sponsor",
        sponsor_tier: "main",
      },
    ],
    vendors: [],
    active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "march-2025",
    year: 2025,
    month: "march",
    edition_type: "festival",
    dates: ["2025-03-07", "2025-03-08", "2025-03-09"],
    venue: BASE_VENUE,
    events: [],
    producers: [],
    sponsors: [],
    vendors: [],
    active: false,
    created_at: "2023-06-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

/** The currently active edition (returned by /api/editions/active). */
export const activeEdition = seedEditions.find((e) => e.active) ?? seedEditions[0];
