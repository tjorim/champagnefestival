import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { Person } from "@/types/person";
import { fetchPeopleByEmail } from "@/lib/query/adminPeopleQueries";
import { m } from "@/paraglide/messages";

export function usePersonDuplicates(
  person: { id: string; email?: string } | null,

  enabled = true,
) {
  const query = useQuery({
    queryKey: ["admin", "people", "by-email", person?.email ?? "", person?.id ?? ""],
    queryFn: ({ signal }) => fetchPeopleByEmail(person!.email ?? "", person!.id, signal),
    enabled: enabled && !!person?.email,
    retry: false,
  });
  return { ...query, data: enabled ? query.data : undefined };
}

export function PersonDuplicates({
  person,

  onMerge,
}: {
  person: Person;

  onMerge: (a: Person, b: Person) => void;
}) {
  const query = usePersonDuplicates(person);
  return (
    <div className="space-y-1">
      {query.isError && <p role="alert">{m.admin_error_load_data()}</p>}
      {!!query.data?.total && (
        <p className="text-highlight text-sm">
          {m.admin_people_duplicates_same_email()} ({query.data.total})
        </p>
      )}
      {query.data?.items.map((duplicate) => (
        <Button
          key={duplicate.id}
          size="sm"
          variant="outline-warning"
          onClick={() => onMerge(person, duplicate)}
          title={`${m.admin_people_merge_title()}: ${duplicate.name}`}
        >
          {m.admin_people_merge_title()}: {duplicate.name}
        </Button>
      ))}
    </div>
  );
}
