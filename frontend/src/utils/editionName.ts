import { m } from "@/paraglide/messages";

/**
 * The one display name for an edition in the admin: the month as the organiser
 * typed it, capitalised, followed by the year ("March 2027"). Edition ids such
 * as `2027-march` are internal and never shown.
 *
 * `year` and `month` identify an edition (the id is derived from them), so the
 * name is unambiguous without the edition type, which the screens show as its
 * own badge. The backend builds the same string for ledger rows
 * (`edition_display_name` in `backend/app/utils.py`); keep the two in step.
 */
export function editionDisplayName(edition: { year: number; month: string }): string {
  const month = edition.month.trim();
  const capitalised = month.charAt(0).toUpperCase() + month.slice(1);
  return [capitalised, edition.year > 0 ? String(edition.year) : ""].filter(Boolean).join(" ");
}

/**
 * `editionDisplayName` with the edition type in front ("Champagnefestival · March
 * 2027"), for places that follow whichever edition is next and so cannot assume
 * a festival: the active-edition strip, its filter toggle and the home tasks.
 */
export function editionDisplayNameWithType(edition: {
  editionType: string;
  year: number;
  month: string;
}): string {
  const name = editionDisplayName(edition);
  switch (edition.editionType) {
    case "bourse":
      return `${m.admin_edition_type_bourse()} · ${name}`;
    case "capsule_exchange":
      return `${m.admin_edition_type_capsule_exchange()} · ${name}`;
    default:
      return `${m.festival_name()} · ${name}`;
  }
}
