import ExhibitorLogoPreview from "@/components/ExhibitorLogoPreview";
import ResponsiveImage from "@/components/ResponsiveImage";
import { useAuth } from "@/contexts/AuthContext";
import { captureAdminExhibitorsFence } from "@/state/adminExhibitorsCollection";
import { useId, useState, type ReactNode } from "react";
import { createAppColumnHelper, useAppTable } from "@/hooks/useAdminTable";
import { AdminDataTable } from "./AdminDataTable";
import { useMutation, useQuery } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AdminField, AdminLabel, AdminTextarea } from "@/components/admin/AdminFields";
import {
  exhibitorChangesRequest,
  ExhibitorChangeConflictError,
  exhibitorFieldLabel,
  exhibitorTextFields,
  type ExhibitorChange,
} from "@/utils/exhibitorChangesApi";

interface ComparisonRow {
  id: string;
  label: string;
  current: ReactNode;
  proposed: ReactNode;
}
const columnHelper = createAppColumnHelper<ComparisonRow>();

function Review({
  change,
  headers,
  onDecided,
}: {
  change: ExhibitorChange;
  headers: () => Record<string, string>;
  onDecided: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    retry: false,
    mutationFn: async (decision: "accepted" | "rejected") => {
      const isCurrent = captureAdminExhibitorsFence();
      await exhibitorChangesRequest(
        `/api/exhibitors/changes/${change.id}/decision`,
        headers(),
        undefined,
        { decision, reason: decision === "rejected" ? reason || null : null },
      );
      return isCurrent;
    },
    onSuccess: (isCurrent) => {
      if (isCurrent()) onDecided();
    },
  });
  const fields = exhibitorTextFields.filter(
    (field) =>
      field in change.proposed ||
      (field !== "website" &&
        exhibitorTextFields.some((key) => key !== "website" && key in change.proposed)),
  );
  const comparisons: ComparisonRow[] = fields.map((field) => ({
    id: field,
    label: exhibitorFieldLabel(field),
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
      proposed: (
        <ExhibitorLogoPreview url={`/api/exhibitors/changes/${change.id}/logo`} headers={headers} />
      ),
    });
  }
  // Review is a bounded field comparison, not a paged exhibitor list. Reuse
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
      <h3 className="text-lg font-medium text-content">{change.exhibitor_name}</h3>
      <div className="overflow-x-auto">
        <AdminDataTable table={table} />
      </div>
      {change.superseded_fields.length > 0 && (
        <p>
          {m.manager_change_superseded()}:{" "}
          {change.superseded_fields.map(exhibitorFieldLabel).join(", ")}
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
          {mutation.error instanceof ExhibitorChangeConflictError
            ? mutation.error.message
            : m.manager_change_review_error()}
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

export default function ExhibitorChangeReview({
  authHeaders,
  onDecided,
}: {
  authHeaders: () => Record<string, string>;
  onDecided: () => void;
}) {
  const instance = useId();
  const { accountId } = useAuth();
  const query = useQuery({
    queryKey: ["admin", "exhibitor-changes", instance, accountId],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      exhibitorChangesRequest<ExhibitorChange[]>("/api/exhibitors/changes", authHeaders(), signal),
  });
  return (
    <section className="flex flex-col gap-4 mb-6">
      <h2 className="text-xl font-medium text-content">{m.manager_change_review()}</h2>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        {m.manager_change_refresh()}
      </Button>
      {query.isError && <Alert variant="danger">{m.manager_change_review_error()}</Alert>}
      {query.data?.length === 0 && <p>{m.manager_change_none()}</p>}
      {query.data?.map((change) => (
        <Review
          key={`${accountId}-${change.id}`}
          change={change}
          headers={authHeaders}
          onDecided={() => {
            void query.refetch();
            onDecided();
          }}
        />
      ))}
    </section>
  );
}
