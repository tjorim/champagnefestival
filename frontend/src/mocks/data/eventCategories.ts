/** Seed data for event categories (the defaults migration 006 creates). */

type Category = {
  key: string;
  label: string;
  label_language: "nl" | "fr" | "en";
  label_nl: string | null;
  label_fr: string | null;
  label_en: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function category(key: string, order: number, nl: string, fr: string, en: string): Category {
  return {
    key,
    label: nl,
    label_language: "nl",
    label_nl: nl,
    label_fr: fr,
    label_en: en,
    sort_order: order,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export const seedEventCategories: Category[] = [
  category("tasting", 10, "Degustatie", "Dégustation", "Tasting"),
  category("vip", 20, "VIP Evenement", "Événement VIP", "VIP Event"),
  category("party", 30, "Feest", "Soirée", "Party"),
  category("breakfast", 40, "Ontbijt", "Petit-déjeuner", "Breakfast"),
  category("exchange", 50, "Ruilbeurs", "Échange", "Exchange"),
  category("general", 60, "Algemeen", "Général", "General"),
  category("ceremony", 70, "Plechtigheid", "Cérémonie", "Ceremony"),
  category("social", 80, "Ontmoeting", "Rencontre", "Social"),
  category("other", 90, "Overig", "Autre", "Other"),
];
