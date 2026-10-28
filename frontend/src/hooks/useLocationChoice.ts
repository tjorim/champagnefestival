import { useNavigate, useSearch } from "@tanstack/react-router";

/** Router-backed navigation preserves namespaced list state and creates Back entries. */
export function useLocationChoice(key: string, choices: readonly string[], fallback: string) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const raw = search[key];
  const value = typeof raw === "string" && choices.includes(raw) ? raw : fallback;
  const setValue = (next: string) => {
    if (!choices.includes(next)) return;
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => {
        const updated = { ...previous, [key]: next };
        if (key === "tab") delete updated.token;
        return updated;
      },
    });
  };
  return [value, setValue, raw !== undefined && raw !== value] as const;
}

export const adminSections = [
  "registrations",
  "waitlist",
  "scratchpad",
  "organizations",
  "editions",
  "floor-plans",
  "venues",
  "people",
  "analytics",
  "audit-log",
  "event-categories",
  "product-categories",
  "email-categories",
  "faq",
  "signage-channels",
  "announcements",
  "policies",
  "settings",
  "contact-details",
  "contact-messages",
] as const;
export const accountTabs = [
  "registrations",
  "organizations",
  "volunteer",
  "email-preferences",
  "account",
] as const;

/** Only allow navigation context through authentication, never emailed credentials. */
export function accountReturnTo(tab: unknown): string {
  return typeof tab === "string" && accountTabs.includes(tab as (typeof accountTabs)[number])
    ? `/me?tab=${encodeURIComponent(tab)}`
    : "/me";
}
