import { useCallback, type Dispatch, type SetStateAction } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MemberFormData } from "@/components/admin/MemberFormModal";
import type { PersonFormData } from "@/components/admin/PersonFormModal";
import type { VolunteerFormData } from "@/components/admin/VolunteerFormModal";
import type { Registration } from "@/types/registration";
import { type Person, apiToPerson } from "@/types/person";
import { fetchVolunteer } from "@/utils/adminFetch";
import { usePeopleMutations } from "@/hooks/usePeopleMutations";
import {
  applyAdminPeopleMerged,
  applyAdminPersonCreated,
  applyAdminPersonDeleted,
  applyAdminPersonUpdated,
  applyAdminVolunteerCreated,
  applyAdminVolunteerDeleted,
  applyAdminVolunteerUpdated,
  captureAdminPeopleFence,
  type AdminPeopleCollection,
} from "@/state/adminPeopleCollection";

interface UseAdminPeopleActionsOptions {
  authHeaders: () => Record<string, string>;
  exhibitorsQueryKey: QueryKey;
  peopleCollection: AdminPeopleCollection;
  queryClient: QueryClient;
  registrationsQueryKey: QueryKey;
  setDetailRegistration: Dispatch<SetStateAction<Registration | null>>;
}

function toRegistrationPerson(person: Person): Registration["person"] {
  return { id: person.id, name: person.name, email: person.email, phone: person.phone };
}

export function useAdminPeopleActions({
  authHeaders,
  exhibitorsQueryKey,
  peopleCollection,
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
    peopleCollection,
    registrationsQueryKey,
    exhibitorsQueryKey,
  });

  // Registrations and exhibitors still carry a copy of the person, so a
  // person change patches those caches too. The people row (and with it the
  // members and volunteers views) is written through the collection helpers,
  // which drop the write if the session changed while the request was in flight.
  const patchRegistrationPerson = useCallback(
    (person: Person, isCurrent: () => boolean) => {
      // A response from an earlier session must not overwrite the current one's rows.
      if (!isCurrent()) return;
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((registration) =>
              registration.personId === person.id
                ? { ...registration, person: toRegistrationPerson(person) }
                : registration,
            )
          : prev,
      );
      setDetailRegistration((prev) =>
        prev?.person.id === person.id ? { ...prev, person: toRegistrationPerson(person) } : prev,
      );
    },
    [queryClient, registrationsQueryKey, setDetailRegistration],
  );

  const handleMergePeople = useCallback(
    async (canonicalId: string, duplicateId: string) => {
      const isCurrent = captureAdminPeopleFence();
      const updated = await mergePeopleMutation.mutateAsync({ canonicalId, duplicateId });
      const canonicalPerson = apiToPerson(updated as Record<string, unknown>);
      await applyAdminPeopleMerged(
        peopleCollection,
        canonicalPerson,
        duplicateId,
        isCurrent,
        async () => (await fetchVolunteer(canonicalId, authHeaders)).helpPeriods,
      );
      if (!isCurrent()) return;
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((registration) =>
              registration.personId === duplicateId
                ? { ...registration, personId: canonicalId, person: canonicalPerson }
                : registration.personId === canonicalId
                  ? { ...registration, person: canonicalPerson }
                  : registration,
            )
          : prev,
      );
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) =>
        prev
          ? prev.map((exhibitor) =>
              exhibitor.contactPersonId === duplicateId
                ? { ...exhibitor, contactPersonId: canonicalId }
                : exhibitor,
            )
          : prev,
      );
    },
    [
      authHeaders,
      exhibitorsQueryKey,
      mergePeopleMutation,
      peopleCollection,
      queryClient,
      registrationsQueryKey,
    ],
  );

  const handleCreateMember = useCallback(
    async (data: MemberFormData) => {
      const isCurrent = captureAdminPeopleFence();
      const response = await createMemberMutation.mutateAsync(data);
      await applyAdminPersonCreated(
        peopleCollection,
        apiToPerson(response as Record<string, unknown>),
        isCurrent,
      );
    },
    [createMemberMutation, peopleCollection],
  );

  const handleUpdateMember = useCallback(
    async (id: string, data: MemberFormData) => {
      const isCurrent = captureAdminPeopleFence();
      const response = await updateMemberMutation.mutateAsync({ id, data });
      const updatedMember = apiToPerson(response as Record<string, unknown>);
      await applyAdminPersonUpdated(peopleCollection, updatedMember, isCurrent);
      patchRegistrationPerson(updatedMember, isCurrent);
    },
    [patchRegistrationPerson, peopleCollection, updateMemberMutation],
  );

  const handleDeleteMember = useCallback(
    async (id: string) => {
      const isCurrent = captureAdminPeopleFence();
      await deleteMemberMutation.mutateAsync(id);
      await applyAdminPersonDeleted(peopleCollection, id, isCurrent);
    },
    [deleteMemberMutation, peopleCollection],
  );

  const handleCreatePerson = useCallback(
    async (data: PersonFormData) => {
      const isCurrent = captureAdminPeopleFence();
      const response = await createPersonMutation.mutateAsync(data);
      await applyAdminPersonCreated(
        peopleCollection,
        apiToPerson(response as Record<string, unknown>),
        isCurrent,
      );
    },
    [createPersonMutation, peopleCollection],
  );

  const handleUpdatePerson = useCallback(
    async (id: string, data: PersonFormData) => {
      const isCurrent = captureAdminPeopleFence();
      const response = await updatePersonMutation.mutateAsync({ id, data });
      const updated = apiToPerson(response as Record<string, unknown>);
      await applyAdminPersonUpdated(peopleCollection, updated, isCurrent);
      patchRegistrationPerson(updated, isCurrent);
    },
    [patchRegistrationPerson, peopleCollection, updatePersonMutation],
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      const isCurrent = captureAdminPeopleFence();
      await deletePersonMutation.mutateAsync(id);
      await applyAdminPersonDeleted(peopleCollection, id, isCurrent);
    },
    [deletePersonMutation, peopleCollection],
  );

  const handleCreateVolunteer = useCallback(
    async (data: VolunteerFormData) => {
      const isCurrent = captureAdminPeopleFence();
      const response = await createVolunteerMutation.mutateAsync(data);
      await applyAdminVolunteerCreated(
        peopleCollection,
        apiToPerson(response as Record<string, unknown>),
        isCurrent,
      );
    },
    [createVolunteerMutation, peopleCollection],
  );

  const handleUpdateVolunteer = useCallback(
    async (id: string, data: VolunteerFormData) => {
      const isCurrent = captureAdminPeopleFence();
      const response = await updateVolunteerMutation.mutateAsync({ id, data });
      await applyAdminVolunteerUpdated(
        peopleCollection,
        apiToPerson(response as Record<string, unknown>),
        isCurrent,
      );
    },
    [peopleCollection, updateVolunteerMutation],
  );

  const handleDeleteVolunteer = useCallback(
    async (id: string) => {
      const isCurrent = captureAdminPeopleFence();
      await deleteVolunteerMutation.mutateAsync(id);
      await applyAdminVolunteerDeleted(peopleCollection, id, isCurrent);
    },
    [deleteVolunteerMutation, peopleCollection],
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
