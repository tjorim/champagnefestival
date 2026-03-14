/**
 * useContent — fetches CMS-managed producers and sponsors from the backend.
 *
 * Falls back to the hardcoded placeholders from `src/config/marqueeSlider.ts`
 * when the backend returns 404 (no data saved yet) or is unreachable.
 * This ensures the public website always renders content even before an admin
 * has configured the live data.
 */

import { useEffect, useState } from "react";
import { producerItems, sponsorItems, type SliderItem } from "../config/marqueeSlider";

export interface ContentState {
  producers: SliderItem[];
  sponsors: SliderItem[];
  /** True once the initial fetch has settled (success or fallback). */
  isLoaded: boolean;
}

async function fetchItems(key: "producers" | "sponsors"): Promise<SliderItem[] | null> {
  try {
    const res = await fetch(`/api/content/${key}`);
    if (!res.ok) return null; // 404 = no data saved yet → use fallback
    const data = (await res.json()) as { value: SliderItem[] };
    // An admin might have saved an empty list; only use it if non-empty so we
    // don't flash an empty carousel before the placeholder kicks in.
    return Array.isArray(data.value) && data.value.length > 0 ? data.value : null;
  } catch {
    return null; // network error → fall back silently
  }
}

export function useContent(): ContentState {
  const [producers, setProducers] = useState<SliderItem[]>(producerItems);
  const [sponsors, setSponsors] = useState<SliderItem[]>(sponsorItems);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [fetchedProducers, fetchedSponsors] = await Promise.all([
        fetchItems("producers"),
        fetchItems("sponsors"),
      ]);

      if (!cancelled) {
        if (fetchedProducers) setProducers(fetchedProducers);
        if (fetchedSponsors) setSponsors(fetchedSponsors);
        setIsLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { producers, sponsors, isLoaded };
}
