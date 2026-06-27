import { useCallback, type Dispatch, type SetStateAction } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MemberFormData } from "@/components/admin/MemberFormModal";
import type { PersonFormData } from "@/components/admin/PersonFormModal";
import type { VolunteerFormData } from "@/components/admin/VolunteerFormModal";
import type { Registration } from "@/types/registration";
import { type Person, apiToPerson } from "@/types/person";
import { usePeopleMutations } from "@/hooks/usePeopleMutations";
import {
  mergeVolunteerPerson,
  replacePersonById,
  replaceVolunteerById,
  syncMembersWithPerson,
} from "@/utils/adminApiMappers";

interface UseAdminPeopleActionsOptions {
  authHeaders: () => Record<string, string>;
  exhibitorsQueryKey: QueryKey;
  membersQueryKey: QueryKey;
  people: Person[];
  peopleQueryKey: QueryKey;
  queryClient: QueryClient;
  registrationsQueryKey: QueryKey;
  setDetailRegistration: Dispatch<SetStateAction<Registration | null>>;
}

export function useAdminPeopleActions({
  authHeaders,
  exhibitorsQueryKey,
  membersQueryKey,
  people,
  peopleQueryKey,
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
    peopleQueryKey,
    membersQueryKey,
    registrationsQueryKey,
    exhibitorsQueryKey,
  });

  const handleMergePeople = useCallback(
    async (canonicalId: string, duplicateId: string) => {
      const updated = await mergePeopleMutation.mutateAsync({ canonicalId, duplicateId });
      const canonicalPerson = apiToPerson(updated as Record<string, unknown>);
      const duplicate = people.find((person) => person.id === duplicateId);
      const existingCanonical = people.find((person) => person.id === canonicalId);
      const shouldPreserveVolunteerData =
        canonicalPerson.roles.includes("volunteer") ||
        existingCanonical?.roles.includes("volunteer") ||
        duplicate?.roles.includes("volunteer");
      const mergedCanonical = shouldPreserveVolunteerData
        ? mergeVolunteerPerson(existingCanonical, {
            ...canonicalPerson,
            helpPeriods: existingCanonical?.helpPeriods ?? duplicate?.helpPeriods ?? [],
          })
        : canonicalPerson;

      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev
          ? prev
              .filter((person) => person.id !== duplicateId)
              .map((person) => (person.id === canonicalId ? mergedCanonical : person))
          : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev
          ? syncMembersWithPerson(
              prev.filter((member) => member.id !== duplicateId),
              mergedCanonical,
            )
          : prev,
      );
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
      exhibitorsQueryKey,
      membersQueryKey,
      mergePeopleMutation,
      people,
      peopleQueryKey,
      queryClient,
      registrationsQueryKey,
    ],
  );

  const handleCreateMember = useCallback(
    async (data: MemberFormData) => {
      const response = await createMemberMutation.mutateAsync(data);
      const createdMember = apiToPerson(response as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? [createdMember, ...prev] : [createdMember],
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [createdMember, ...prev] : [createdMember],
      );
    },
    [createMemberMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleUpdateMember = useCallback(
    async (id: string, data: MemberFormData) => {
      const response = await updateMemberMutation.mutateAsync({ id, data });
      const updatedMember = apiToPerson(response as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.map((member) => (member.id === id ? updatedMember : member)) : prev,
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replacePersonById(prev, updatedMember) : prev,
      );
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((registration) =>
              registration.personId === id
                ? {
                    ...registration,
                    person: {
                      id: updatedMember.id,
                      name: updatedMember.name,
                      email: updatedMember.email,
                      phone: updatedMember.phone,
                    },
                  }
                : registration,
            )
          : prev,
      );
      setDetailRegistration((prev) =>
        prev?.person.id === id
          ? {
              ...prev,
              person: {
                id: updatedMember.id,
                name: updatedMember.name,
                email: updatedMember.email,
                phone: updatedMember.phone,
              },
            }
          : prev,
      );
    },
    [
      membersQueryKey,
      peopleQueryKey,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      updateMemberMutation,
    ],
  );

  const handleDeleteMember = useCallback(
    async (id: string) => {
      await deleteMemberMutation.mutateAsync(id);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.filter((member) => member.id !== id) : prev,
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? prev.filter((person) => person.id !== id) : prev,
      );
    },
    [deleteMemberMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleCreatePerson = useCallback(
    async (data: PersonFormData) => {
      const response = await createPersonMutation.mutateAsync(data);
      const createdPerson = apiToPerson(response as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [createdPerson, ...prev] : [createdPerson],
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? syncMembersWithPerson(prev, createdPerson) : prev,
      );
    },
    [createPersonMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleUpdatePerson = useCallback(
    async (id: string, data: PersonFormData) => {
      const response = await updatePersonMutation.mutateAsync({ id, data });
      const updated = apiToPerson(response as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replacePersonById(prev, updated) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? syncMembersWithPerson(prev, updated) : prev,
      );
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((registration) =>
              registration.personId === id
                ? {
                    ...registration,
                    person: {
                      id: updated.id,
                      name: updated.name,
                      email: updated.email,
                      phone: updated.phone,
                    },
                  }
                : registration,
            )
          : prev,
      );
      setDetailRegistration((prev) =>
        prev?.person.id === id
          ? {
              ...prev,
              person: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                phone: updated.phone,
              },
            }
          : prev,
      );
    },
    [
      membersQueryKey,
      peopleQueryKey,
      queryClient,
      registrationsQueryKey,
      setDetailRegistration,
      updatePersonMutation,
    ],
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      await deletePersonMutation.mutateAsync(id);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? prev.filter((person) => person.id !== id) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.filter((member) => member.id !== id) : prev,
      );
    },
    [deletePersonMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleCreateVolunteer = useCallback(
    async (data: VolunteerFormData) => {
      const response = await createVolunteerMutation.mutateAsync(data);
      const createdVolunteer = apiToPerson(response as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [mergeVolunteerPerson(undefined, createdVolunteer), ...prev] : prev,
      );
    },
    [createVolunteerMutation, peopleQueryKey, queryClient],
  );

  const handleUpdateVolunteer = useCallback(
    async (id: string, data: VolunteerFormData) => {
      const response = await updateVolunteerMutation.mutateAsync({ id, data });
      const updatedVolunteer = apiToPerson(response as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replaceVolunteerById(prev, updatedVolunteer) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev
          ? prev.map((member) =>
              member.id === id
                ? {
                    ...member,
                    name: updatedVolunteer.name,
                    address: updatedVolunteer.address,
                    active: updatedVolunteer.active,
                    updatedAt: updatedVolunteer.updatedAt,
                  }
                : member,
            )
          : prev,
      );
    },
    [membersQueryKey, peopleQueryKey, queryClient, updateVolunteerMutation],
  );

  const handleDeleteVolunteer = useCallback(
    async (id: string) => {
      await deleteVolunteerMutation.mutateAsync(id);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev
          ? prev.map((person) =>
              person.id !== id
                ? person
                : {
                    ...person,
                    roles: person.roles.filter((role) => role !== "volunteer"),
                    helpPeriods: [],
                  },
            )
          : prev,
      );
    },
    [deleteVolunteerMutation, peopleQueryKey, queryClient],
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
