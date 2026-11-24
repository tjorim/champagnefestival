import { useQueryClient } from "@tanstack/react-query";
import PeopleSection from "../people/PeopleSection";
import { useAdminWorkspace } from "./AdminWorkspace";
import { useAdminPeopleActions } from "./useAdminPeopleActions";

export default function AdminPeopleSection() {
  const { queries, detailRegistration, setDetailRegistration } = useAdminWorkspace();
  const {
    organizationsCollection,
    registrationsCollection,
    peopleCountsQuery,
    registrationsQueryKey,
  } = queries;
  const queryClient = useQueryClient();
  const {
    handleCreateMember,
    handleCreatePerson,
    handleCreateVolunteer,
    handleDeactivateMember,
    handleDeletePerson,
    handleDeactivateVolunteer,
    handleReactivateMember,
    handleReactivateVolunteer,
    handleMergePeople,
    handleUpdateMember,
    handleUpdatePerson,
    handleUpdateVolunteer,
  } = useAdminPeopleActions({
    detailRegistration,

    organizationsCollection,
    registrationsCollection,
    queryClient,
    registrationsQueryKey,
    setDetailRegistration,
  });
  return (
    <PeopleSection
      counts={{
        all: peopleCountsQuery.data?.total ?? 0,
        members: peopleCountsQuery.data?.by_role.member ?? 0,
        volunteers: peopleCountsQuery.data?.by_role.volunteer ?? 0,
      }}
      people={{
        onMerge: handleMergePeople,
        onCreate: handleCreatePerson,
        onUpdate: handleUpdatePerson,
        onDelete: handleDeletePerson,
      }}
      members={{
        onCreate: handleCreateMember,
        onUpdate: handleUpdateMember,
        onDeactivate: handleDeactivateMember,
        onReactivate: handleReactivateMember,
      }}
      volunteers={{
        onCreate: handleCreateVolunteer,
        onUpdate: handleUpdateVolunteer,
        onDeactivate: handleDeactivateVolunteer,
        onReactivate: handleReactivateVolunteer,
      }}
    />
  );
}
