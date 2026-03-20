import { m } from "../paraglide/messages";

export interface NavLink {
  getLabel: () => string;
  href: string;
}

export const mainNavLinks: NavLink[] = [
  {
    getLabel: m.what_we_do_title,
    href: "#what-we-do",
  },
  {
    getLabel: m.next_festival_title,
    href: "#next-festival",
  },
  { getLabel: m.schedule_title, href: "#schedule" },
  { getLabel: m.location_title, href: "#map" },
  { getLabel: m.faq_title, href: "#faq" },
  { getLabel: m.contact_title, href: "#contact" },
  { getLabel: m.reservation_title, href: "#reservations" },
];
