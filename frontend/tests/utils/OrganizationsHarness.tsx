import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import OrganizationsManagement from "@/features/admin/organizations/OrganizationsManagement";
import { collectionError } from "@/lib/collections/adminCollectionFactory";
import {
  createAdminOrganizationsCollection,
  registerAdminOrganizationsCollection,
  type AdminOrganizationsCollection,
} from "@/lib/collections/adminOrganizationsCollection";

/**
 * Mounts the organisations list over a live organisations collection, the way
 * the dashboard's section does, and hands the collection to the test.
 */
export function OrganizationsHarness({
  onCollection,
}: {
  onCollection?: (collection: AdminOrganizationsCollection) => void;
}) {
  const queryClient = useQueryClient();
  const collection = useMemo(
    () => createAdminOrganizationsCollection({ queryClient, enabled: true }),
    [queryClient],
  );
  useEffect(() => registerAdminOrganizationsCollection(collection), [collection]);
  useEffect(() => onCollection?.(collection), [collection, onCollection]);
  const live = useLiveQuery(collection);
  return (
    <OrganizationsManagement
      organizations={live.data}
      collection={collection}
      isPending={live.isLoading}
      loadError={live.status === "error" || collectionError(collection) != null}
    />
  );
}
