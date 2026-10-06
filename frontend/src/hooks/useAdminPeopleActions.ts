import {
  refetchAdminRegistrations,
  type AdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MemberFormData } from "@/components/admin/MemberFormModal";
import type { PersonFormData } from "@/components/admin/PersonFormModal";
import type { VolunteerFormData } from "@/components/admin/VolunteerFormModal";
import type { Registration } from "@/types/registration";
import { usePeopleMutations } from "@/hooks/usePeopleMutations";
import { captureAdminPeopleFence } from "@/state/adminPeopleSession";
import {
  applyAdminExhibitorContactsMerged,
  captureAdminExhibitorsFence,
  refetchAdminExhibitors,
  type AdminExhibitorsCollection,
} from "@/state/adminExhibitorsCollection";

interface UseAdminPeopleActionsOptions {
  authHeaders: () => Record<string, string>;
  exhibitorsCollection: AdminExhibitorsCollection;
  registrationsCollection: AdminRegistrationsCollection;
  queryClient: QueryClient;
  registrationsQueryKey: QueryKey;
  setDetailRegistration: Dispatch<SetStateAction<Registration | null>>;
}

export function useAdminPeopleActions({
  authHeaders,
  exhibitorsCollection,
  registrationsCollection,
  queryClient,
  registrationsQueryKey,
  setDetailRegistration,
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
    registrationsQueryKey,
  });

  const handleMergePeople = useCallback(
    async (canonicalId: string, duplicateId: string) => {
      const isCurrent = captureAdminPeopleFence();
      const isExhibitorsCurrent = captureAdminExhibitorsFence();

      try {
        await mergePeopleMutation.mutateAsync({
          canonicalId,
          duplicateId,
        });
      } catch (error) {
        // A failed merge may still have committed: learn the real contacts.
        void refetchAdminExhibitors(exhibitorsCollection, isExhibitorsCurrent);
        if (isCurrent()) await refetchAdminRegistrations(registrationsCollection);
        throw error;
      }
      if (!isCurrent()) return;
      // The server repointed the duplicate's exhibitor contacts; mirror that,
      // then refetch to pick up anything the local repoint did not cover.
      await applyAdminExhibitorContactsMerged(
        exhibitorsCollection,
        duplicateId,
        canonicalId,
        isExhibitorsCurrent,
      );
      await refetchAdminExhibitors(exhibitorsCollection, isExhibitorsCurrent);
      if (isCurrent()) await refetchAdminRegistrations(registrationsCollection);
    },
    [exhibitorsCollection, mergePeopleMutation, registrationsCollection],
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
          if (current())
            setDetailRegistration((previous) =>
              previous ? (registrationsCollection.get(previous.id) ?? null) : null,
            );
        }
      }
    },
    [updateMemberMutation, registrationsCollection, setDetailRegistration],
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
          if (current())
            setDetailRegistration((previous) =>
              previous ? (registrationsCollection.get(previous.id) ?? null) : null,
            );
        }
      }
    },
    [updatePersonMutation, registrationsCollection, setDetailRegistration],
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
