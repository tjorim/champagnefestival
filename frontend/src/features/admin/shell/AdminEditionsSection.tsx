import { Card, CardContent } from "@/components/ui/card";
import { EditionsSection } from "../editions/EditionsSection";
import { useAdminWorkspace } from "./AdminWorkspace";

export default function AdminEditionsSection() {
  const {
    queries: { venuesQuery, organizationsQuery },
  } = useAdminWorkspace();
  return (
    <Card tone="secondary" className="mb-4">
      <CardContent>
        <EditionsSection
          venues={venuesQuery.data ?? []}
          organizations={organizationsQuery.data}
          organizationsPending={organizationsQuery.isPending}
        />
      </CardContent>
    </Card>
  );
}
