import { useQuery } from "@tanstack/react-query";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import { m } from "@/paraglide/messages";

type Membership = { state: "active" | "inactive" | "unavailable" };

export default function MyMembership({
  getAccessToken,
  accountId,
}: {
  getAccessToken: () => string | null;
  accountId: string | null | undefined;
}) {
  const membership = useQuery({
    queryKey: ["my-membership", accountId],
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }): Promise<Membership> => {
      const token = getAccessToken();
      const response = await fetch("/api/me/membership", {
        signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Membership read failed");
      return response.json();
    },
  });
  return (
    <section aria-label={m.membership_title()} className="mb-6 rounded border border-border p-4">
      <h2 className="text-xl font-semibold mb-3">{m.membership_title()}</h2>
      {membership.isPending && <p role="status">{m.loading()}</p>}
      {membership.isError && (
        <LoadErrorAlert onRetry={() => void membership.refetch()} retrying={membership.isFetching}>
          {m.membership_load_error()}
        </LoadErrorAlert>
      )}
      {membership.isSuccess && (
        <p className="font-medium mb-3">
          {membership.data.state === "active"
            ? m.membership_active()
            : membership.data.state === "inactive"
              ? m.membership_inactive()
              : m.membership_unknown()}
        </p>
      )}
      <p className="text-sm mb-3">{m.membership_help()}</p>
      <p className="text-sm text-subtle">{m.membership_rewards()}</p>
    </section>
  );
}
