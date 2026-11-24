import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Organization, OrganizationCreate } from "@/api-types";
import {
  applyAdminOrganizationDeleted,
  applyAdminOrganizationSaved,
  captureAdminOrganizationsFence,
  type AdminOrganizationsCollection,
} from "@/lib/collections/adminOrganizationsCollection";
import {
  deleteOrganization,
  saveOrganization,
  setOrganizationActive,
} from "@/lib/api/organizationsApi";
import { queryKeys } from "@/lib/query/queryKeys";

/**
 * The organisation writes of the dashboard. Each takes the collection's session
 * fence before its request, writes the server's response into the collection
 * (the only client cache of organisations) and drops that write when the
 * session ended while the request was in flight. Failures are thrown to the
 * caller, which owns the translated message. Nothing here retries a write.
 */
export function useOrganizationActions(collection: AdminOrganizationsCollection) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: OrganizationCreate }) =>
      saveOrganization(id, body),
    retry: false,
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      setOrganizationActive(id, active),
    retry: false,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteOrganization(id),
    retry: false,
  });

  // A changed organisation can settle a pending change proposal.
  const reflectSaved = useCallback(
    async (saved: Organization, isCurrent: () => boolean) => {
      await applyAdminOrganizationSaved(collection, saved, isCurrent);
      if (isCurrent())
        void queryClient.invalidateQueries({ queryKey: queryKeys.admin.organizationChanges });
    },
    [collection, queryClient],
  );

  const save = useCallback(
    async (id: number | null, body: OrganizationCreate) => {
      const isCurrent = captureAdminOrganizationsFence();
      const saved = await saveMutation.mutateAsync({ id, body });
      await reflectSaved(saved, isCurrent);
      return saved;
    },
    [reflectSaved, saveMutation],
  );

  const setActive = useCallback(
    async (id: number, active: boolean) => {
      const isCurrent = captureAdminOrganizationsFence();
      const saved = await activeMutation.mutateAsync({ id, active });
      await reflectSaved(saved, isCurrent);
      return saved;
    },
    [activeMutation, reflectSaved],
  );

  /** Archive several organisations, one request each; resolves with how many failed. */
  const archiveMany = useCallback(
    async (ids: number[]) => {
      const isCurrent = captureAdminOrganizationsFence();
      const results = await Promise.allSettled(
        ids.map((id) => activeMutation.mutateAsync({ id, active: false })),
      );
      for (const result of results) {
        if (result.status === "fulfilled") await reflectSaved(result.value, isCurrent);
      }
      return results.filter((result) => result.status === "rejected").length;
    },
    [activeMutation, reflectSaved],
  );

  const remove = useCallback(
    async (id: number) => {
      const isCurrent = captureAdminOrganizationsFence();
      await deleteMutation.mutateAsync(id);
      await applyAdminOrganizationDeleted(collection, id, isCurrent);
    },
    [collection, deleteMutation],
  );

  return { save, setActive, archiveMany, remove, saving: saveMutation.isPending };
}
