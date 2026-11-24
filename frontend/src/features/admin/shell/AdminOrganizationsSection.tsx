import { Card, CardContent } from "@/components/ui/card";
import {
  captureAdminOrganizationsFence,
  refetchAdminOrganizations,
} from "@/lib/collections/adminOrganizationsCollection";
import OrganizationChangeReview from "../organizations/OrganizationChangeReview";
import OrganizationsManagement from "../organizations/OrganizationsManagement";
import { useAdminWorkspace } from "./AdminWorkspace";

export default function AdminOrganizationsSection() {
  const {
    queries: { organizationsCollection, organizationsQuery },
  } = useAdminWorkspace();
  return (
    <Card tone="secondary" className="mb-4">
      <CardContent>
        <OrganizationChangeReview
          onDecided={() => {
            // An accepted proposal changed organisation rows the collection has not seen.
            void refetchAdminOrganizations(
              organizationsCollection,
              captureAdminOrganizationsFence(),
            );
          }}
        />
        <OrganizationsManagement
          organizations={organizationsQuery.data}
          collection={organizationsCollection}
          isPending={organizationsQuery.isPending}
          loadError={organizationsQuery.error != null}
        />
      </CardContent>
    </Card>
  );
}
