import { SPONSOR_TIERS, type SliderItem, type SponsorTier } from "@/config/editions";
import { m } from "@/paraglide/messages";

export interface SponsorGroup {
  /** `null` groups the sponsors without a level; they are listed last and get no heading. */
  tier: SponsorTier | null;
  items: SliderItem[];
}

export function sponsorTierLabel(tier: SponsorTier): string {
  switch (tier) {
    case "main":
      return m.sponsor_tier_main();
    case "partner":
      return m.sponsor_tier_partner();
    case "supporter":
      return m.sponsor_tier_supporter();
  }
}

/**
 * Splits sponsors into one group per level, highest level first, keeping the order the API
 * gave within a level (the admin-defined lineup order). Empty groups are dropped.
 */
export function groupSponsorsByTier(items: SliderItem[]): SponsorGroup[] {
  const groups: SponsorGroup[] = [...SPONSOR_TIERS, null].map((tier) => ({
    tier,
    items: items.filter((item) => (item.sponsor_tier ?? null) === tier),
  }));
  return groups.filter((group) => group.items.length > 0);
}
