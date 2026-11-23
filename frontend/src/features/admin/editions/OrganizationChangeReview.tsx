import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import OrganizationLogoPreview from "@/components/OrganizationLogoPreview";
import ResponsiveImage from "@/components/ResponsiveImage";
import { useAuth } from "@/app/providers/AuthContext";
import { captureAdminOrganizationsFence } from "@/lib/collections/adminOrganizationsCollection";
import { useId, useState, type ReactNode } from "react";
import { createAppColumnHelper, useAppTable } from "../shared/useAdminTable";
import { AdminDataTable } from "../shared/AdminDataTable";
import { useMutation, useQuery } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AdminField, AdminLabel, AdminTextarea } from "@/components/admin/AdminFields";
import {
  organizationFieldLabel,
  organizationTextFields,
  type OrganizationChange,
} from "@/lib/api/organizationChangesApi";

interface ComparisonRow {
  id: string;
  label: string;
  current: ReactNode;
  proposed: ReactNode;
}
const columnHelper = createAppColumnHelper<ComparisonRow>();

function Review({ change, onDecided }: { change: OrganizationChange; onDecided: () => void }) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    retry: false,
    mutationFn: async (decision: "accepted" | "rejected") => {
      const isCurrent = captureAdminOrganizationsFence();
      await fetchJsonOrThrow(
        `/api/organizations/changes/${change.id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            reason: decision === "rejected" ? reason || null : null,
          }),
        },
        m.manager_error(),
      );
      return isCurrent;
    },
    onSuccess: (isCurrent) => {
      if (isCurrent()) onDecided();
    },
  });
  const fields = organizationTextFields.filter(
    (field) =>
      field in change.proposed ||
      (field !== "website" &&
        organizationTextFields.some((key) => key !== "website" && key in change.proposed)),
  );
  const comparisons: ComparisonRow[] = fields.map((field) => ({
    id: field,
    label: organizationFieldLabel(field),
    current: change.current[field] || "—",
    proposed: (field in change.proposed ? change.proposed[field] : change.current[field]) || "—",
  }));
  if (change.proposed.image) {
    comparisons.unshift({
      id: "image",
      label: m.logo_upload_label(),
      current: change.current.image ? (
        <ResponsiveImage
          src={change.current.image}
          alt={m.manager_change_current()}
          className="max-w-64"
        />
      ) : (
        "—"
      ),
      proposed: <OrganizationLogoPreview url={`/api/organizations/changes/${change.id}/logo`} />,
    });
  }
  // Review is a bounded field comparison, not a paged organization list. Reuse
  // the shared controlled renderer while Query owns the complete pending set.
  const table = useAppTable({
    data: comparisons,
    getRowId: (row) => row.id,
    enableSorting: false,
    manualSorting: true,
    manualFiltering: true,
    columns: [
      columnHelper.display({
        id: "label",
        header: m.manager_change_field(),
        cell: (info) => <span className="font-medium">{info.row.original.label}</span>,
      }),
      columnHelper.display({
        id: "current",
        header: m.manager_change_current(),
        cell: (info) => info.row.original.current,
        meta: { tdClassName: "whitespace-pre-wrap break-words" },
      }),
      columnHelper.display({
        id: "proposed",
        header: m.manager_change_proposed(),
        cell: (info) => info.row.original.proposed,
        meta: { tdClassName: "whitespace-pre-wrap break-words" },
      }),
    ],
  });
  return (
    <article className="rounded-lg border border-subtle p-4 flex flex-col gap-4">
      <h3 className="text-base font-semibold text-content">{change.organization_name}</h3>
      <div className="overflow-x-auto">
        <AdminDataTable table={table} />
      </div>
      {change.superseded_fields.length > 0 && (
        <p>
          {m.manager_change_superseded()}:{" "}
          {change.superseded_fields.map(organizationFieldLabel).join(", ")}
        </p>
      )}
      <AdminField>
        <AdminLabel>{m.manager_change_reason()}</AdminLabel>
        <AdminTextarea
          maxLength={2000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </AdminField>
      {mutation.isError && (
        <Alert variant="danger" role="alert">
          {apiErrorMessage(mutation.error, m.manager_change_review_error())}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate("accepted")}>
          {m.manager_change_accept()}
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("rejected")}
        >
          {m.manager_change_reject()}
        </Button>
      </div>
    </article>
  );
}

export default function OrganizationChangeReview({ onDecided }: { onDecided: () => void }) {
  const instance = useId();
  const { accountId } = useAuth();
  const query = useQuery({
    queryKey: ["admin", "organization-changes", instance, accountId],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      fetchJsonOrThrow<OrganizationChange[]>(
        "/api/organizations/changes",
        { signal },
        m.manager_error(),
      ),
  });
  return (
    <section className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-content">{m.manager_change_review()}</h2>
        {query.data?.length === 0 && (
          <p className="text-sm text-subtle">{m.manager_change_none()}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {m.manager_change_refresh()}
        </Button>
      </div>
      {query.isError && <Alert variant="danger">{m.manager_change_review_error()}</Alert>}
      {query.data?.map((change) => (
        <Review
          key={`${accountId}-${change.id}`}
          change={change}

          onDecided={() => {
            void query.refetch();
            onDecided();
          }}
        />
      ))}
    </section>
  );
}
