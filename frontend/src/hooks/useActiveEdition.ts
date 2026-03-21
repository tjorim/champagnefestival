/**
 * useActiveEdition — fetches the active festival edition from the backend API.
 *
 * Initialises with the static fallback from `editions.ts` (immediate, no flash),
 * then fetches `/api/editions/active` to get live data including embedded venue,
 * events, producers, and sponsors.
 * Silently keeps the static fallback on any network or parse error.
 */

import { useEffect, useState } from "react";
import { getActiveEdition, type Edition } from "@/config/editions";
import { mapApiEditionToEdition, type ApiEdition } from "@/utils/editionApi";

export interface ActiveEditionState {
  edition: Edition;
  /** True once the fetch has settled (success or failure). */
  isLoaded: boolean;
}

export function useActiveEdition(): ActiveEditionState {
  const [edition, setEdition] = useState<Edition>(getActiveEdition);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/editions/active");
        if (!res.ok) {
          setIsLoaded(true);
          return;
        }

        const api = (await res.json()) as ApiEdition;
        if (cancelled) return;
        setEdition(mapApiEditionToEdition(api, getActiveEdition().dates));
        setIsLoaded(true);
      } catch {
        // Network error or parse failure — keep static fallback silently.
        setIsLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { edition, isLoaded };
}
