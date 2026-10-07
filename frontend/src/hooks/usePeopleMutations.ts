import { useRef } from "react";
import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MemberFormData } from "@/components/admin/MemberFormModal";
import type { PersonFormData } from "@/components/admin/PersonFormModal";
import type { VolunteerFormData } from "@/components/admin/VolunteerFormModal";
import { m } from "@/paraglide/messages";
import { captureAdminPeopleFence } from "@/state/adminPeopleSession";
import { peopleWrites, type PeopleWrite } from "@/utils/optimisticPeoplePages";
import { queryKeys } from "@/utils/queryKeys";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { invalidateAdmin } from "@/utils/queryInvalidation";

interface UsePeopleMutationsOptions {
  queryClient: QueryClient;
  authHeaders: () => Record<string, string>;
  registrationsQueryKey: QueryKey;
}

export function usePeopleMutations({
  queryClient,
  authHeaders,
  registrationsQueryKey,
}: UsePeopleMutationsOptions) {
  const writes = peopleWrites(queryClient);
  const fences = useRef(new Map<unknown, (() => boolean)[]>());
  const variableKey = (variables: unknown) =>
    typeof variables === "object" && variables !== null && "data" in variables
      ? variables.data
      : variables;
  const takeFence = (key: unknown) => {
    const queue = fences.current.get(key);
    const current = queue?.shift() ?? (() => false);
    if (!queue?.length) fences.current.delete(key);
    return current;
  };
  const refreshPeople = (isCurrent: () => boolean, extraKeys: readonly QueryKey[] = []) => {
    if (!isCurrent()) return Promise.resolve();
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.people }),
      invalidateAdmin(queryClient, extraKeys),
    ]).then(() => undefined);
  };
  const optimistic = <T>(
    toWrite: (variables: T) => PeopleWrite,
    extraKeys: readonly QueryKey[] = [],
  ) => ({
    mutationKey: ["admin", "people", "write"],
    onMutate: (variables: T) => {
      const current = captureAdminPeopleFence();
      const key = variableKey(variables);
      const queue = fences.current.get(key) ?? [];
      queue.push(current);
      fences.current.set(key, queue);
      return writes.begin(toWrite(variables), current);
    },
    onError: (
      _error: Error,
      _variables: T,
      context: Awaited<ReturnType<typeof writes.begin>> | undefined,
    ) => (context ? writes.settle(context, false) : undefined),
    onSettled: async (
      _data: unknown,
      error: Error | null,
      _variables: T,
      context: Awaited<ReturnType<typeof writes.begin>> | undefined,
    ) => {
      if (!context) return;
      if (!error) await writes.settle(context, true);
      await refreshPeople(context.current, extraKeys);
    },
  });
  const direct = (extraKeys: readonly QueryKey[] = []) => ({
    onMutate: () => captureAdminPeopleFence(),
    onSettled: (
      _data: unknown,
      _error: Error | null,
      _variables: unknown,
      current: (() => boolean) | undefined,
    ) => (current ? refreshPeople(current, extraKeys) : undefined),
  });

  const mergePeopleMutation = useMutation({
    mutationFn: ({ canonicalId, duplicateId }: { canonicalId: string; duplicateId: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${canonicalId}/merge/${duplicateId}`,
        { method: "POST", headers: authHeaders() },
        m.admin_people_merge_error(),
      ),
    ...direct([registrationsQueryKey]),
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
    ...direct(),
    retry: false,
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemberFormData }) =>
      writes.persist(id, takeFence(data), () =>
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
      ),
    ...optimistic(
      ({ id, data }: { id: string; data: MemberFormData }) => ({
        id,
        update: (person) => ({ ...person, ...data }),
      }),
      [registrationsQueryKey],
    ),
    retry: false,
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) =>
      writes.persist(id, takeFence(id), () =>
        fetchVoidOrThrowWithUnauthorized(
          `/api/members/${id}`,
          { method: "DELETE", headers: authHeaders() },
          m.admin_members_error_delete(),
        ),
      ),
    ...optimistic((id: string) => ({ id, update: () => null })),
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
    ...direct(),
    retry: false,
  });

  const updatePersonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PersonFormData }) =>
      writes.persist(id, takeFence(data), () =>
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
      ),
    ...optimistic(
      ({ id, data }: { id: string; data: PersonFormData }) => ({
        id,
        update: (person) => ({ ...person, ...data }),
      }),
      [registrationsQueryKey],
    ),
    retry: false,
  });

  const deletePersonMutation = useMutation({
    mutationFn: (id: string) =>
      writes.persist(id, takeFence(id), () =>
        fetchVoidOrThrowWithUnauthorized(
          `/api/people/${id}`,
          { method: "DELETE", headers: authHeaders() },
          m.admin_error_delete_person(),
        ),
      ),
    ...optimistic((id: string) => ({ id, update: () => null })),
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
    ...direct(),
    retry: false,
  });

  const updateVolunteerMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: VolunteerFormData }) =>
      writes.persist(id, takeFence(data), () =>
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
      ),
    ...optimistic(
      ({ id, data }: { id: string; data: VolunteerFormData }) => ({
        id,
        update: (person) => ({
          ...person,
          ...data,
          helpPeriods: data.helpPeriods.map((period, index) => ({
            ...period,
            id: person.helpPeriods[index]?.id ?? -(index + 1),
          })),
        }),
      }),
      [],
    ),
    retry: false,
  });

  const deleteVolunteerMutation = useMutation({
    mutationFn: (id: string) =>
      writes.persist(id, takeFence(id), () =>
        fetchVoidOrThrowWithUnauthorized(
          `/api/volunteers/${id}`,
          { method: "DELETE", headers: authHeaders() },
          m.admin_volunteers_error_delete(),
        ),
      ),
    ...optimistic((id: string) => ({
      id,
      update: (person) => ({
        ...person,
        roles: person.roles.filter((role) => role !== "volunteer"),
        helpPeriods: [],
      }),
    })),
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
