import { m } from "@/paraglide/messages";

/**
 * The three things a first-time visitor needs to know, shown under "What we do":
 * entry is free, tasting works with the festival glass and tokens, and bottles are
 * bought directly from the producers.
 */
export const featureItems = [
  {
    id: 1,
    getTitle: m.what_we_do_feature1_title,
    getDesc: m.what_we_do_feature1_description,
  },
  {
    id: 2,
    getTitle: m.what_we_do_feature2_title,
    getDesc: m.what_we_do_feature2_description,
  },
  {
    id: 3,
    getTitle: m.what_we_do_feature3_title,
    getDesc: m.what_we_do_feature3_description,
  },
] as const;
