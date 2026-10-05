import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MemberFormData } from "@/components/admin/MemberFormModal";
import type { PersonFormData } from "@/components/admin/PersonFormModal";
import type { VolunteerFormData } from "@/components/admin/VolunteerFormModal";
import { m } from "@/paraglide/messages";
import {
  invalidateAdminPersonDetailQueries,
  refetchAdminPeople,
  type AdminPeopleCollections,
} from "@/state/adminPeopleCollection";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { invalidateAdmin } from "@/utils/queryInvalidation";

interface UsePeopleMutationsOptions {
  queryClient: QueryClient;
  authHeaders: () => Record<string, string>;
  peopleCollections: AdminPeopleCollections;
  registrationsQueryKey: QueryKey;
  exhibitorsQueryKey: QueryKey;
}

export function usePeopleMutations({
  queryClient,
  authHeaders,
  peopleCollections,
  registrationsQueryKey,
  exhibitorsQueryKey,
}: UsePeopleMutationsOptions) {
  // Refetches the collections a write touched (explicitly: the implicit refetch
  // after a write is deprecated) and the plain queries that show the same person.
  const refreshPeople = (
    resources: readonly ("people" | "members")[],
    extraKeys: readonly QueryKey[] = [],
  ) => {
    void Promise.all([
      refetchAdminPeople(peopleCollections, resources),
      invalidateAdminPersonDetailQueries(queryClient),
      invalidateAdmin(queryClient, extraKeys),
    ]);
  };

  const mergePeopleMutation = useMutation({
    mutationFn: ({ canonicalId, duplicateId }: { canonicalId: string; duplicateId: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${canonicalId}/merge/${duplicateId}`,
        { method: "POST", headers: authHeaders() },
        m.admin_people_merge_error(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"], [registrationsQueryKey, exhibitorsQueryKey]);
    },
    retry: false,
  });

  const createMemberMutation = useMutation({
    mutationFn: (data: MemberFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/members",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            preferred_language: data.preferredLanguage,
            address: data.address,
            club_name: data.clubName,
            notes: data.notes,
            active: data.active,
          }),
        },
        m.admin_members_error_create(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"]);
    },
    retry: false,
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemberFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/members/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            preferred_language: data.preferredLanguage,
            address: data.address,
            club_name: data.clubName,
            notes: data.notes,
            active: data.active,
          }),
        },
        m.admin_members_error_update(),
      ),
    onSettled: () => {
      refreshPeople(["members", "people"], [registrationsQueryKey]);
    },
    retry: false,
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/members/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_members_error_delete(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"]);
    },
    retry: false,
  });

  const createPersonMutation = useMutation({
    mutationFn: (data: PersonFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/people",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            preferred_language: data.preferredLanguage,
            address: data.address,
            roles: data.roles,
            notes: data.notes,
            club_name: data.clubName,
            active: data.active,
          }),
        },
        m.admin_people_error_create(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"]);
    },
    retry: false,
  });

  const updatePersonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PersonFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            preferred_language: data.preferredLanguage,
            address: data.address,
            roles: data.roles,
            notes: data.notes,
            club_name: data.clubName,
            active: data.active,
          }),
        },
        m.admin_people_error_update(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"], [registrationsQueryKey]);
    },
    retry: false,
  });

  const deletePersonMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/people/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_person(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"]);
    },
    retry: false,
  });

  const createVolunteerMutation = useMutation({
    mutationFn: (data: VolunteerFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/volunteers",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            address: data.address,
            national_register_number: data.nationalRegisterNumber,
            eid_document_number: data.eidDocumentNumber,
            active: data.active,
            help_periods: data.helpPeriods.map((period) => ({
              first_help_day: period.firstHelpDay,
              last_help_day: period.lastHelpDay,
              notes: period.notes,
            })),
          }),
        },
        m.admin_volunteers_error_create(),
      ),
    onSettled: () => {
      refreshPeople(["people"]);
    },
    retry: false,
  });

  const updateVolunteerMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: VolunteerFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/volunteers/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            address: data.address,
            national_register_number: data.nationalRegisterNumber,
            eid_document_number: data.eidDocumentNumber,
            active: data.active,
            help_periods: data.helpPeriods.map((period) => ({
              first_help_day: period.firstHelpDay,
              last_help_day: period.lastHelpDay,
              notes: period.notes,
            })),
          }),
        },
        m.admin_volunteers_error_update(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"]);
    },
    retry: false,
  });

  const deleteVolunteerMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/volunteers/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_volunteers_error_delete(),
      ),
    onSettled: () => {
      refreshPeople(["people", "members"]);
    },
    retry: false,
  });

  return {
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
  };
}
