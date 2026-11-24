import type { Person } from "@/types/person";

export function mergeVolunteerPerson(existing: Person | undefined, volunteer: Person): Person {
  const roles = new Set(existing?.roles ?? volunteer.roles);
  roles.add("volunteer");
  return {
    ...(existing ?? volunteer),
    ...volunteer,
    email: existing?.email ?? volunteer.email,
    phone: existing?.phone ?? volunteer.phone,
    notes: existing?.notes ?? volunteer.notes,
    roles: [...roles],
    help_periods: volunteer.help_periods,
  };
}

export function mergePeopleWithVolunteers(people: Person[], volunteers: Person[]): Person[] {
  const volunteerById = new Map(volunteers.map((volunteer) => [volunteer.id, volunteer]));
  const mergedPeople = people.map((person) => {
    const volunteer = volunteerById.get(person.id);
    return volunteer ? mergeVolunteerPerson(person, volunteer) : person;
  });

  const knownIds = new Set(mergedPeople.map((person) => person.id));
  const volunteerOnly = volunteers
    .filter((volunteer) => !knownIds.has(volunteer.id))
    .map((volunteer) => mergeVolunteerPerson(undefined, volunteer));

  return [...mergedPeople, ...volunteerOnly];
}

/**
 * Adds volunteer details (help periods and identity numbers) to the people that
 * hold the volunteer role, leaving every other row alone. Unlike
 * `mergePeopleWithVolunteers` it never adds a volunteer who is not already in
 * `people`, which is what a search needs: a volunteer who did not match the
 * query must not appear in the results.
 */
export function attachVolunteerDetails(people: Person[], volunteers: Person[]): Person[] {
  const volunteerById = new Map(volunteers.map((volunteer) => [volunteer.id, volunteer]));
  return people.map((person) => {
    const volunteer = volunteerById.get(person.id);
    return volunteer ? mergeVolunteerPerson(person, volunteer) : person;
  });
}

export function mergePersonUpdate(existing: Person | undefined, updated: Person): Person {
  if (!existing) {
    return updated;
  }

  if (!(updated.roles ?? []).includes("volunteer")) {
    return updated;
  }

  return {
    ...updated,
    help_periods: existing.help_periods,
  };
}
