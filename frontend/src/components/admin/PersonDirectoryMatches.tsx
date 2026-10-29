import { useEffect, useState } from "react";
import { usePeopleListQuery } from "@/hooks/usePeopleListQuery";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";

/** Suggestions use the authorised, bounded directory search, never a cached page filter. */
export function PersonDirectoryMatches({
  name,
  email,
  authHeaders,
  onReuse,
}: {
  name: string;
  email: string;
  authHeaders: () => Record<string, string>;
  onReuse: (person: Person) => void;
}) {
  const search = email.trim() || name.trim();
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const matches = usePeopleListQuery(
    { page: 1, limit: 5, q: query },
    authHeaders,
    query.length >= 3,
  );
  if (query !== search || query.length < 3 || matches.isPlaceholderData) return null;
  // A failed search must not look like "no matches": the organiser could create a duplicate.
  if (matches.isError)
    return (
      <Alert variant="warning" role="status" className="mb-4">
        {m.admin_person_matches_unavailable()}
      </Alert>
    );
  if (!matches.data?.items.length) return null;
  return (
    <Alert className="mb-4">
      <p>{m.admin_person_matches_help()}</p>
      <ul>
        {matches.data.items.map((person) => (
          <li key={person.id} className="flex items-center gap-2">
            <span>
              {person.name} {person.email}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => onReuse(person)}>
              {m.admin_person_reuse()}
            </Button>
          </li>
        ))}
      </ul>
      <p>{m.admin_person_continue_help()}</p>
    </Alert>
  );
}
