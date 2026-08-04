import { m } from "@/paraglide/messages";

export interface NavigationItem {
  href: string;
  getLabel: () => string;
}

export const navigationItems: NavigationItem[] = [
  { href: "#schedule", getLabel: () => m.nav_schedule() },
  { href: "#other-events", getLabel: () => m.nav_other_events() },
  { href: "#faq", getLabel: () => m.nav_faq() },
  { href: "#contact", getLabel: () => m.nav_contact() },
];
