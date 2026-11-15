import type { Person } from "@/api-types";
export type { Person, VolunteerPeriodOut as VolunteerHelpPeriod } from "@/api-types";
import type { VolunteerPeriodOut as VolunteerHelpPeriod } from "@/api-types";

/** A local ISO date (`YYYY-MM-DD`) relative to today, comparable with help-period day strings. */
export function localIsoDate(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * When a volunteer last helped: `"ongoing"` while a period is open, otherwise the latest end day,
 * or `null` without periods. Informational only: whether someone is still a volunteer is `active`.
 */
export function lastHelpedDay(periods: VolunteerHelpPeriod[]): string | null {
  if (periods.some((period) => period.last_help_day === null)) return "ongoing";
  let latest: string | null = null;
  for (const period of periods) {
    if (period.last_help_day !== null && (latest === null || period.last_help_day > latest)) {
      latest = period.last_help_day;
    }
  }
  return latest;
}

/** Active in a role: the person is not anonymised and has not retired that role. */
export function isRoleActive(
  person: Pick<Person, "anonymised" | "retired_roles">,
  role: string,
): boolean {
  return !person.anonymised && !Object.hasOwn(person.retired_roles, role);
}

/** When the person's current (or, if retired, latest) stretch of a role started, if known. */
export function roleSince(person: Person, role: string): string | null {
  return person.role_history[role]?.at(-1)?.started_on ?? null;
}
