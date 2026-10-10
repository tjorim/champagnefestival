import { useEffect } from "react";
import { managedArtwork } from "@/utils/editionArtwork";

const HERO_VARIABLE = "--edition-hero-image";

/**
 * Publishes the edition's uploaded hero photo as `--edition-hero-image` on <html>
 * (#1224). The hero rules in the themes and the maintenance page read the variable
 * with the static photo as the `var()` fallback, so a missing or cleared upload
 * needs no code path of its own. The path is validated before it reaches CSS.
 */
export function useEditionHeroImage(heroImage: string | null | undefined) {
  useEffect(() => {
    const path = managedArtwork(heroImage);
    if (!path) return;
    const root = document.documentElement;
    root.style.setProperty(HERO_VARIABLE, `url("${path}")`);
    return () => {
      root.style.removeProperty(HERO_VARIABLE);
    };
  }, [heroImage]);
}
