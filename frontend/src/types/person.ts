export interface VolunteerHelpPeriod {
  id: number;
  firstHelpDay: string;
  lastHelpDay: string | null;
  notes: string;
}

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
  if (periods.some((period) => period.lastHelpDay === null)) return "ongoing";
  let latest: string | null = null;
  for (const period of periods) {
    if (period.lastHelpDay !== null && (latest === null || period.lastHelpDay > latest)) {
      latest = period.lastHelpDay;
    }
  }
  return latest;
}

/** Active in a role: the person is not anonymised and has not retired that role. */
export function isRoleActive(
  person: Pick<Person, "anonymised" | "retiredRoles">,
  role: string,
): boolean {
  return !person.anonymised && !Object.hasOwn(person.retiredRoles, role);
}

export interface RoleStretch {
  startedOn: string | null;
  endedOn: string | null;
}

/** When the person's current (or, if retired, latest) stretch of a role started, if known. */
export function roleSince(person: Person, role: string): string | null {
  return person.roleHistory[role]?.at(-1)?.startedOn ?? null;
}

export interface Person {
  id: string;
  registrationCount?: number;
  rewardDue?: boolean;
  lastAttended?: string | null;
  inactivityHighlight?: boolean;
  inactivityExempt?: boolean;
  inactivityExemptNote?: string;
  name: string;
  email: string;
  phone: string;
  preferredLanguage?: "nl" | "fr" | "en" | null;
  address: string;
  roles: string[];
  nationalRegisterNumber: string | null;
  eidDocumentNumber: string | null;
  visitsPerMonth: number | null;
  notes: string;
  /** Set once the record has been anonymised; such a person is inactive in every role. */
  anonymised: boolean;
  /** Roles the person stepped back from (role to ISO day); they stay in `roles`. */
  retiredRoles: Record<string, string>;
  /** When each role was held: one stretch per spell, oldest first; null = unknown. */
  roleHistory: Record<string, RoleStretch[]>;
  helpPeriods: VolunteerHelpPeriod[];
  createdAt: string;
  updatedAt: string;
}

export function apiToPerson(d: Record<string, unknown>): Person {
  return {
    id: d.id as string,
    rewardDue: d.reward_due === true,
    lastAttended: (d.last_attended as string | null) ?? null,
    inactivityHighlight: d.inactivity_highlight === true,
    inactivityExempt: d.inactivity_exempt === true,
    inactivityExemptNote: (d.inactivity_exempt_note as string) ?? "",
    name: d.name as string,
    email: (d.email ?? "") as string,
    phone: (d.phone ?? "") as string,
    preferredLanguage: (d.preferred_language as Person["preferredLanguage"]) ?? null,
    address: (d.address ?? "") as string,
    roles: (d.roles as string[]) ?? [],
    nationalRegisterNumber: (d.national_register_number as string | null) ?? null,
    eidDocumentNumber: (d.eid_document_number as string | null) ?? null,
    visitsPerMonth: (d.visits_per_month as number | null) ?? null,
    notes: (d.notes ?? "") as string,
    anonymised: (d.anonymised ?? false) as boolean,
    retiredRoles: (d.retired_roles as Record<string, string> | undefined) ?? {},
    roleHistory: Object.fromEntries(
      Object.entries((d.role_history as Record<string, unknown[]> | undefined) ?? {}).map(
        ([role, stretches]) => [
          role,
          stretches.map((stretch) => {
            const s = stretch as Record<string, unknown>;
            return {
              startedOn: (s.started_on as string | null) ?? null,
              endedOn: (s.ended_on as string | null) ?? null,
            };
          }),
        ],
      ),
    ),
    helpPeriods: Array.isArray(d.help_periods)
      ? d.help_periods.map((period) => {
          const p = period as Record<string, unknown>;
          return {
            id: (p.id ?? 0) as number,
            firstHelpDay: p.first_help_day as string,
            lastHelpDay: (p.last_help_day as string | null) ?? null,
            notes: (p.notes ?? "") as string,
          };
        })
      : [],
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
  };
}
