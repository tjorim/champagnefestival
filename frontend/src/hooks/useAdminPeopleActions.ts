import {
  refetchAdminRegistrations,
  type AdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import { queryKeys } from "@/utils/queryKeys";
import { fetchRegistration } from "@/utils/adminFetch";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MemberFormData } from "@/components/admin/MemberFormModal";
import type { PersonFormData } from "@/components/admin/PersonFormModal";
import type { VolunteerFormData } from "@/components/admin/VolunteerFormModal";
import type { Registration } from "@/types/registration";
import { usePeopleMutations } from "@/hooks/usePeopleMutations";
import { captureAdminPeopleFence } from "@/state/adminPeopleSession";
import {
  applyAdminOrganizationContactsMerged,
  captureAdminOrganizationsFence,
  refetchAdminOrganizations,
  type AdminOrganizationsCollection,
} from "@/state/adminOrganizationsCollection";

interface UseAdminPeopleActionsOptions {
  authHeaders: () => Record<string, string>;
  organizationsCollection: AdminOrganizationsCollection;
  registrationsCollection: AdminRegistrationsCollection;
  queryClient: QueryClient;
  registrationsQueryKey: QueryKey;
  detailRegistration?: Registration | null;
  setDetailRegistration: Dispatch<SetStateAction<Registration | null>>;
}

export function useAdminPeopleActions({
  authHeaders,
  organizationsCollection,
  registrationsCollection,
  queryClient,
  setDetailRegistration,
  detailRegistration,
}: UseAdminPeopleActionsOptions) {
  const {
    mergePeopleMutation,
    createMemberMutation,
    updateMemberMutation,
    deleteMemberMutation,
    createPersonMutation,
    updatePersonMutation,
    deletePersonMutation,
    createVolunteerMutation,
    updateVolunteerMutation,
    deleteVolunteerMutation,
  } = usePeopleMutations({
    queryClient,
    authHeaders,
    registrationsQueryKey: queryKeys.admin.registrations,
  });

  const handleMergePeople = useCallback(
    async (canonicalId: string, duplicateId: string) => {
      const isCurrent = captureAdminPeopleFence();
      const isOrganizationsCurrent = captureAdminOrganizationsFence();

      try {
        await mergePeopleMutation.mutateAsync({
          canonicalId,
          duplicateId,
        });
      } catch (error) {
        // A failed merge may still have committed: learn the real contacts.
        void refetchAdminOrganizations(organizationsCollection, isOrganizationsCurrent);
        if (isCurrent()) await refetchAdminRegistrations(registrationsCollection);
        throw error;
      }
      if (!isCurrent()) return;
      // The server repointed the duplicate's organization contacts; mirror that,
      // then refetch to pick up anything the local repoint did not cover.
      await applyAdminOrganizationContactsMerged(
        organizationsCollection,
        duplicateId,
        canonicalId,
        isOrganizationsCurrent,
      );
      await refetchAdminOrganizations(organizationsCollection, isOrganizationsCurrent);
      if (isCurrent()) await refetchAdminRegistrations(registrationsCollection);
    },
    [organizationsCollection, mergePeopleMutation, registrationsCollection],
  );

  const handleCreateMember = useCallback(
    async (data: MemberFormData) => {
      await createMemberMutation.mutateAsync(data);
    },
    [createMemberMutation],
  );

  const handleUpdateMember = useCallback(
    async (id: string, data: MemberFormData) => {
      const current = captureAdminPeopleFence();
      try {
        await updateMemberMutation.mutateAsync({ id, data });
      } finally {
        if (current()) {
          await refetchAdminRegistrations(registrationsCollection);
          const updatedDetail = detailRegistration
            ? (registrationsCollection.get(detailRegistration.id) ??
              (await fetchRegistration(detailRegistration.id, authHeaders).catch(() => null)))
            : null;
          if (current())
            setDetailRegistration((previous) =>
              previous?.id === updatedDetail?.id ? updatedDetail : previous,
            );
        }
      }
    },
    [
      updateMemberMutation,
      registrationsCollection,
      setDetailRegistration,
      detailRegistration,
      authHeaders,
    ],
  );

  const handleDeleteMember = useCallback(
    async (id: string) => {
      await deleteMemberMutation.mutateAsync(id);
    },
    [deleteMemberMutation],
  );

  const handleCreatePerson = useCallback(
    async (data: PersonFormData) => {
      await createPersonMutation.mutateAsync(data);
    },
    [createPersonMutation],
  );

  const handleUpdatePerson = useCallback(
    async (id: string, data: PersonFormData) => {
      const current = captureAdminPeopleFence();
      try {
        await updatePersonMutation.mutateAsync({ id, data });
      } finally {
        if (current()) {
          await refetchAdminRegistrations(registrationsCollection);
          const updatedDetail = detailRegistration
            ? (registrationsCollection.get(detailRegistration.id) ??
              (await fetchRegistration(detailRegistration.id, authHeaders).catch(() => null)))
            : null;
          if (current())
            setDetailRegistration((previous) =>
              previous?.id === updatedDetail?.id ? updatedDetail : previous,
            );
        }
      }
    },
    [
      updatePersonMutation,
      registrationsCollection,
      setDetailRegistration,
      detailRegistration,
      authHeaders,
    ],
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      await deletePersonMutation.mutateAsync(id);
    },
    [deletePersonMutation],
  );

  const handleCreateVolunteer = useCallback(
    async (data: VolunteerFormData) => {
      await createVolunteerMutation.mutateAsync(data);
    },
    [createVolunteerMutation],
  );

  const handleUpdateVolunteer = useCallback(
    async (id: string, data: VolunteerFormData) => {
      await updateVolunteerMutation.mutateAsync({ id, data });
    },
    [updateVolunteerMutation],
  );

  const handleDeleteVolunteer = useCallback(
    async (id: string) => {
      await deleteVolunteerMutation.mutateAsync(id);
    },
    [deleteVolunteerMutation],
  );

  return {
    handleCreateMember,
    handleCreatePerson,
    handleCreateVolunteer,
    handleDeleteMember,
    handleDeletePerson,
    handleDeleteVolunteer,
    handleMergePeople,
    handleUpdateMember,
    handleUpdatePerson,
    handleUpdateVolunteer,
  };
}
