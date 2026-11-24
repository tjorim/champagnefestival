import { formatNumber } from "@/lib/format/numberUtils";
import { getLocale } from "@/paraglide/runtime";
import { Button } from "@/components/ui/button";
import { ArrowLeftRightIcon, UserRoundCogIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { type PeopleManagementState } from "./usePeopleManagement";

interface MergeDialogProps {
  state: PeopleManagementState;
}

/** Confirms merging two duplicate people. */
export function MergeDialog({ state }: MergeDialogProps) {
  const { handleMergeConfirm, setMergeState, merging, mergeError } = state;
  const mergeState = state.mergeState;
  if (!mergeState) return null;
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) setMergeState(null);
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle id="merge-modal-title">
            <Icon icon={UserRoundCogIcon} className="me-2" />
            {m.admin_people_merge_title()}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {mergeError && (
            <Alert role="alert" aria-live="assertive" variant="danger">
              {mergeError}
            </Alert>
          )}

          <p className="text-subtle text-sm mb-4">{m.admin_people_duplicates_same_email()}</p>

          {(["canonical", "duplicate"] as const).map((role) => {
            const person = mergeState[role];
            const resCount = person.registration_count ?? 0;
            const label =
              role === "canonical" ? m.admin_people_merge_into() : m.admin_people_merge_discard();
            const variant = role === "canonical" ? "success" : "danger";
            const tone =
              role === "canonical"
                ? "border-success text-success-text"
                : "border-destructive text-destructive";

            return (
              <Card key={role} tone={variant} className="mb-4">
                <CardHeader className={`${tone} text-sm font-semibold flex justify-between`}>
                  <span>{label}</span>
                  <Button
                    size="sm"
                    variant={`outline-${variant}`}
                    aria-label={m.admin_people_merge_swap_label()}
                    title={m.admin_people_merge_swap_label()}
                    onClick={() =>
                      setMergeState({
                        canonical: mergeState.duplicate,
                        duplicate: mergeState.canonical,
                      })
                    }
                  >
                    <Icon icon={ArrowLeftRightIcon} />
                  </Button>
                </CardHeader>
                <CardContent className="py-2 text-sm">
                  <div className="font-semibold">{person.name}</div>
                  <div className="text-subtle">{person.email}</div>
                  {person.phone && <div className="text-subtle">{person.phone}</div>}
                  <div className="mt-1">
                    <Badge variant={resCount > 0 ? "warning" : "secondary"}>
                      {formatNumber(resCount, getLocale())} {m.admin_people_registrations_count()}
                    </Badge>
                    {(person.roles ?? []).map((r) => (
                      <Badge key={r} variant="secondary" className="ms-1 capitalize">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => setMergeState(null)}>
            {m.close()}
          </Button>
          <Button variant="warning" onClick={handleMergeConfirm} disabled={merging}>
            {merging ? (
              <Spinner size="sm" role="status" aria-hidden="true" />
            ) : (
              <>
                <Icon icon={UserRoundCogIcon} className="me-1" />
                {m.admin_people_merge_confirm()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
