import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import type { OrganizationOut } from "@/api-types";
import { m } from "@/paraglide/messages";
import { queryKeys } from "@/lib/query/queryKeys";
import {
  applyAdminOrganizationDeleted,
  applyAdminOrganizationSaved,
  captureAdminOrganizationsFence,
  refetchAdminOrganizations,
} from "@/lib/collections/adminOrganizationsCollection";
import OrganizationChangeReview from "../editions/OrganizationChangeReview";
import { ContentSection, EditionsSection } from "../editions/ContentManagement";
import { useAdminWorkspace } from "./AdminWorkspace";

export function OrganizationsSection() {
  const {
    queries: { organizationsCollection },
  } = useAdminWorkspace();
  const queryClient = useQueryClient();
  // A saved or deleted organization is written into the collection from the
  // server's response, unless the session ended while the request was in flight.
  const handleOrganizationSaved = useCallback(
    (item: OrganizationOut, isCurrent: () => boolean) => {
      void applyAdminOrganizationSaved(organizationsCollection, item, isCurrent);
    },
    [organizationsCollection],
  );

  const handleOrganizationDeleted = useCallback(
    (id: number, isCurrent: () => boolean) => {
      void applyAdminOrganizationDeleted(organizationsCollection, id, isCurrent);
    },
    [organizationsCollection],
  );

  return (
    <Card tone="secondary" className="mb-4">
      <CardContent>
        <OrganizationChangeReview
          onDecided={() => {
            void refetchAdminOrganizations(
              organizationsCollection,
              captureAdminOrganizationsFence(),
            );
            void queryClient.invalidateQueries({
              queryKey: queryKeys.admin.contentManagement.section("organizations"),
            });
          }}
        />
        <ContentSection
          sectionKey="organizations"
          title={m.admin_content_organizations_section()}

          onItemSaved={handleOrganizationSaved}
          onItemDeleted={handleOrganizationDeleted}
          captureFence={captureAdminOrganizationsFence}
        />
      </CardContent>
    </Card>
  );
}

export function EditionsPane() {
  const {
    queries: { venuesQuery },
  } = useAdminWorkspace();
  const venues = venuesQuery.data ?? [];
  return (
    <Card tone="secondary" className="mb-4">
      <CardContent>
        <EditionsSection venues={venues} />
      </CardContent>
    </Card>
  );
}
