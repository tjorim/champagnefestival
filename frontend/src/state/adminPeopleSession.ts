import { createEpochFence } from "@/state/epochFence";

// Query pages have no collection registry. Advance on sign-out or auth-provider
// replacement; every mutation captures this fence before its first await.
const session = createEpochFence();
export const captureAdminPeopleFence = session.capture;
export const resetAdminPeopleSession = session.advance;
